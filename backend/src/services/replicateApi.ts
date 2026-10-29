import { setAssetBuffer, broadcast } from './jobStore.js'
import { saveAsset, saveMetadata, modelAssetName } from './outputStore.js'
import { resizeIfNeeded } from './imageResize.js'
import { providerError } from './providerError.js'
import type { Job } from '../types.js'

// Pinned to latest version — update if Replicate releases a new one
// https://replicate.com/firtoz/trellis/versions/e8f6c45206993f297372f5436b90350817bd9b4a0d52d2a76df50c1c8afa2b3c
const TRELLIS_VERSION = 'e8f6c45206993f297372f5436b90350817bd9b4a0d52d2a76df50c1c8afa2b3c'
const API_BASE = 'https://api.replicate.com/v1'
const POLL_INTERVAL = 5_000

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}

function bumpProgress(current: number): number {
  return Math.min(current + 7, 90)
}

export async function startReplicateJob(job: Job): Promise<void> {
  const token = process.env.REPLICATE_API_TOKEN
  if (!token) throw new Error('REPLICATE_API_TOKEN not set')

  job.model.status = 'processing'
  job.model.message = 'Preparing image...'
  job.model.progress = 5
  broadcast(job.id)

  const { base64, mimeType } = await resizeIfNeeded(job.imageBase64, job.imageMimeType)
  const dataUri = `data:${mimeType};base64,${base64}`

  job.model.message = 'Submitting to Replicate (TRELLIS)...'
  job.model.progress = 10
  broadcast(job.id)

  // TRELLIS requires explicit version + uses "images" array (not "image")
  const submitResp = await fetch(`${API_BASE}/predictions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'wait=10',
    },
    body: JSON.stringify({
      version: TRELLIS_VERSION,
      input: {
        images: [dataUri],
        texture_size: 1024,
        mesh_simplify: 0.95,
        generate_model: true,
        generate_color: true,
      },
    }),
  })

  if (!submitResp.ok) {
    const text = await submitResp.text()
    throw new Error(providerError('Replicate', submitResp.status, text))
  }

  const prediction = await submitResp.json() as {
    id: string
    status: string
    output?: string[]
    error?: string
    urls: { get: string }
  }

  job.model.externalOperationId = prediction.id
  job.model.message = 'Generating 3D model (TRELLIS)...'
  job.model.progress = 15
  broadcast(job.id)

  if (prediction.status === 'succeeded') {
    await finalize(job, prediction.output!)
    return
  }

  if (prediction.status === 'failed') {
    throw new Error(prediction.error ?? 'Replicate prediction failed')
  }

  // Polling loop
  const pollUrl = prediction.urls.get
  while (true) {
    await sleep(POLL_INTERVAL)

    const pollResp = await fetch(pollUrl, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!pollResp.ok) {
      throw new Error(`Replicate poll failed: ${pollResp.status}`)
    }

    const data = await pollResp.json() as {
      status: string
      output?: string[]
      error?: string
    }

    if (data.status === 'succeeded') {
      await finalize(job, data.output!)
      return
    }

    if (data.status === 'failed' || data.status === 'canceled') {
      throw new Error(data.error ?? `Replicate prediction ${data.status}`)
    }

    job.model.progress = bumpProgress(job.model.progress)
    job.model.message =
      data.status === 'processing' ? 'Generating 3D model...' : 'In queue...'
    broadcast(job.id)
  }
}

async function finalize(job: Job, output: string[]): Promise<void> {
  const glbUrl = output.find((u) => u.endsWith('.glb')) ?? output[0]
  if (!glbUrl) throw new Error('No GLB in Replicate output')

  job.model.message = 'Downloading 3D model...'
  job.model.progress = 90
  broadcast(job.id)

  const fileResp = await fetch(glbUrl)
  if (!fileResp.ok) throw new Error(`GLB download failed: ${fileResp.status}`)

  const buf = Buffer.from(await fileResp.arrayBuffer())
  setAssetBuffer(`${job.id}:glb`, buf)
  saveAsset(job.imageHash, modelAssetName(job.provider), buf)
  saveMetadata(job, { glb: modelAssetName(job.provider) })

  job.model.status = 'done'
  job.model.progress = 100
  job.model.assetUrl = `/api/assets/${job.id}/glb`
  job.model.message = '3D model ready (TRELLIS)'
  broadcast(job.id)
}
