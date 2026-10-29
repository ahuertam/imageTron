import { setAssetBuffer, broadcast } from './jobStore.js'
import { saveAsset, saveMetadata, modelAssetName } from './outputStore.js'
import { resizeIfNeeded } from './imageResize.js'
import { providerError } from './providerError.js'
import type { Job } from '../types.js'

const ENDPOINT = 'fal-ai/hunyuan3d-v3/image-to-3d'
const QUEUE_BASE = `https://queue.fal.run/${ENDPOINT}`
const POLL_INTERVAL = 10_000

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}

function bumpProgress(current: number): number {
  return Math.min(current + 10, 90)
}

export async function startFalJob(job: Job): Promise<void> {
  const falKey = process.env.FAL_KEY
  if (!falKey) throw new Error('FAL_KEY not set')

  job.model.status = 'processing'
  job.model.message = 'Preparing image...'
  broadcast(job.id)

  const { base64, mimeType } = await resizeIfNeeded(job.imageBase64, job.imageMimeType)

  job.model.message = 'Submitting to FAL Hunyuan3D...'
  broadcast(job.id)

  const imageUrl = `data:${mimeType};base64,${base64}`

  const submitResp = await fetch(QUEUE_BASE, {
    method: 'POST',
    headers: { Authorization: `Key ${falKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_url: imageUrl,
      face_count: 50000,
      enable_pbr: true,
      generate_type: 'Normal',
    }),
  })

  if (!submitResp.ok) {
    const text = await submitResp.text()
    throw new Error(providerError('FAL', submitResp.status, text))
  }

  const submitData = await submitResp.json() as Record<string, unknown>
  const requestId = submitData.request_id as string

  job.model.externalOperationId = requestId
  job.model.message = 'In queue...'
  job.model.progress = 5
  broadcast(job.id)

  const statusUrl = `${QUEUE_BASE}/requests/${requestId}/status`
  const resultUrl = `${QUEUE_BASE}/requests/${requestId}/response`

  while (true) {
    await sleep(POLL_INTERVAL)

    const statusResp = await fetch(statusUrl, {
      headers: { Authorization: `Key ${falKey}` },
    })

    if (!statusResp.ok) {
      throw new Error(`FAL poll failed: ${statusResp.status}`)
    }

    const data = await statusResp.json() as Record<string, unknown>

    if (data.status === 'COMPLETED') {
      job.model.message = 'Downloading 3D model...'
      broadcast(job.id)

      const resultResp = await fetch(resultUrl, {
        headers: { Authorization: `Key ${falKey}` },
      })
      const resultData = await resultResp.json() as Record<string, unknown>
      const modelMesh = resultData.model_mesh as Record<string, string> | undefined
      const glbUrl = modelMesh?.url ?? (resultData.glb_url as string)

      if (!glbUrl) throw new Error('No GLB URL in FAL response')

      const fileResp = await fetch(glbUrl)
      const buf = Buffer.from(await fileResp.arrayBuffer())
      setAssetBuffer(`${job.id}:glb`, buf)
      saveAsset(job.imageHash, modelAssetName(job.provider), buf)
      saveMetadata(job, { glb: modelAssetName(job.provider) })

      job.model.status = 'done'
      job.model.progress = 100
      job.model.assetUrl = `/api/assets/${job.id}/glb`
      job.model.message = '3D model ready (FAL Hunyuan3D)'
      broadcast(job.id)
      return
    }

    if (data.status === 'FAILED') {
      throw new Error((data.error as string) ?? 'FAL job failed')
    }

    const queuePos = data.queue_position as number | undefined
    job.model.message = queuePos != null ? `In queue (position ${queuePos})` : 'Generating 3D model...'
    job.model.progress = bumpProgress(job.model.progress)
    broadcast(job.id)
  }
}
