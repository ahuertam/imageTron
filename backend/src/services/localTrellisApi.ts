import { setAssetBuffer, broadcast } from './jobStore.js'
import { saveAsset, saveMetadata, modelAssetName } from './outputStore.js'
import { resizeIfNeeded } from './imageResize.js'
import { safeFetch } from './safeUrl.js'
import { providerError } from './providerError.js'
import type { Job } from '../types.js'

const POLL_INTERVAL = 3_000

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}

function bumpProgress(current: number): number {
  return Math.min(current + 8, 90)
}

export async function startLocalTrellisJob(job: Job, serverUrl: string): Promise<void> {
  const base = serverUrl.replace(/\/$/, '')

  job.model.status = 'processing'
  job.model.message = 'Preparing image...'
  job.model.progress = 5
  broadcast(job.id)

  const { base64, mimeType } = await resizeIfNeeded(job.imageBase64, job.imageMimeType)
  const dataUri = `data:${mimeType};base64,${base64}`

  job.model.message = 'Submitting to local TRELLIS...'
  job.model.progress = 10
  broadcast(job.id)

  const submitResp = await safeFetch(`${base}/predictions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: dataUri }),
  })

  if (!submitResp.ok) {
    const text = await submitResp.text()
    throw new Error(providerError('Local TRELLIS', submitResp.status, text))
  }

  const prediction = await submitResp.json() as {
    id?: string
    status?: string
    output?: string | string[]
    glb_url?: string
    error?: string
  }

  // If the server returns the result synchronously (no async id)
  if (prediction.output || prediction.glb_url) {
    await finalize(job, prediction)
    return
  }

  if (!prediction.id) {
    throw new Error('Local TRELLIS did not return a prediction id or output')
  }

  if (prediction.status === 'failed') {
    throw new Error(prediction.error ?? 'Local TRELLIS prediction failed')
  }

  job.model.externalOperationId = prediction.id
  job.model.message = 'Generating 3D model (local TRELLIS)...'
  job.model.progress = 15
  broadcast(job.id)

  // Polling loop
  while (true) {
    await sleep(POLL_INTERVAL)

    const pollResp = await safeFetch(`${base}/predictions/${prediction.id}`)
    if (!pollResp.ok) {
      throw new Error(`Local TRELLIS poll failed: ${pollResp.status}`)
    }

    const data = await pollResp.json() as {
      id?: string
      status?: string
      output?: string | string[]
      glb_url?: string
      error?: string
    }

    if (data.status === 'succeeded' || data.output || data.glb_url) {
      await finalize(job, data)
      return
    }

    if (data.status === 'failed' || data.status === 'canceled') {
      throw new Error(data.error ?? `Local TRELLIS prediction ${data.status}`)
    }

    job.model.progress = bumpProgress(job.model.progress)
    job.model.message =
      data.status === 'processing' ? 'Generating 3D model...' : 'In queue...'
    broadcast(job.id)
  }
}

async function finalize(
  job: Job,
  data: { output?: string | string[]; glb_url?: string }
): Promise<void> {
  let glbUrl: string | undefined

  if (data.glb_url) {
    glbUrl = data.glb_url
  } else if (Array.isArray(data.output)) {
    glbUrl = data.output.find((u) => u.endsWith('.glb')) ?? data.output[0]
  } else if (typeof data.output === 'string') {
    glbUrl = data.output
  }

  if (!glbUrl) throw new Error('No GLB URL in local TRELLIS response')

  job.model.message = 'Downloading 3D model...'
  job.model.progress = 90
  broadcast(job.id)

  const fileResp = await safeFetch(glbUrl)
  if (!fileResp.ok) throw new Error(`GLB download failed: ${fileResp.status}`)

  const buf = Buffer.from(await fileResp.arrayBuffer())
  setAssetBuffer(`${job.id}:glb`, buf)
  saveAsset(job.imageHash, modelAssetName(job.provider), buf)
  saveMetadata(job, { glb: modelAssetName(job.provider) })

  job.model.status = 'done'
  job.model.progress = 100
  job.model.assetUrl = `/api/assets/${job.id}/glb`
  job.model.message = '3D model ready (local TRELLIS)'
  broadcast(job.id)
}
