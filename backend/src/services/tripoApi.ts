import { setAssetBuffer, broadcast } from './jobStore.js'
import { saveAsset, saveMetadata, modelAssetName } from './outputStore.js'
import { resizeIfNeeded } from './imageResize.js'
import { providerError } from './providerError.js'
import type { Job } from '../types.js'

const API_BASE = 'https://api.tripo3d.ai/v2/openapi'
const POLL_INTERVAL = 10_000

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}

function bumpProgress(current: number): number {
  return Math.min(current + 8, 90)
}

export async function startTripoJob(job: Job): Promise<void> {
  const key = process.env.TRIPO_API_KEY
  if (!key) throw new Error('TRIPO_API_KEY not set')

  job.model.status = 'processing'
  job.model.message = 'Preparing image...'
  broadcast(job.id)

  const { base64, mimeType } = await resizeIfNeeded(job.imageBase64, job.imageMimeType)

  job.model.message = 'Uploading image to Tripo3D...'
  broadcast(job.id)

  // Step 1: upload image to get a token
  const imageBuffer = Buffer.from(base64, 'base64')
  const form = new FormData()
  form.append('file', new Blob([imageBuffer], { type: mimeType }), 'image.jpg')

  const uploadResp = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  })

  if (!uploadResp.ok) {
    const text = await uploadResp.text()
    throw new Error(providerError('Tripo', uploadResp.status, text))
  }

  const uploadData = await uploadResp.json() as { code: number; data: { image_token: string } }
  const imageToken = uploadData.data.image_token

  // Step 2: create image-to-3d task
  const taskResp = await fetch(`${API_BASE}/task`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'image_to_model',
      file: { type: 'jpg', file_token: imageToken },
    }),
  })

  if (!taskResp.ok) {
    const text = await taskResp.text()
    throw new Error(providerError('Tripo', taskResp.status, text))
  }

  const taskData = await taskResp.json() as { code: number; data: { task_id: string } }
  const taskId = taskData.data.task_id

  job.model.externalOperationId = taskId
  job.model.message = 'Generating 3D model...'
  job.model.progress = 10
  broadcast(job.id)

  // Step 3: poll until done
  while (true) {
    await sleep(POLL_INTERVAL)

    const pollResp = await fetch(`${API_BASE}/task/${taskId}`, {
      headers: { Authorization: `Bearer ${key}` },
    })

    if (!pollResp.ok) {
      throw new Error(`Tripo poll failed: ${pollResp.status}`)
    }

    const pollData = await pollResp.json() as {
      code: number
      data: {
        status: string
        progress: number
        result?: { model: { url: string } }
      }
    }

    const t = pollData.data
    if (t.status === 'success') {
      const glbUrl = t.result!.model.url
      job.model.message = 'Downloading 3D model...'
      broadcast(job.id)

      const fileResp = await fetch(glbUrl)
      const buf = Buffer.from(await fileResp.arrayBuffer())
      setAssetBuffer(`${job.id}:glb`, buf)
      saveAsset(job.imageHash, modelAssetName(job.provider), buf)
      saveMetadata(job, { glb: modelAssetName(job.provider) })

      job.model.status = 'done'
      job.model.progress = 100
      job.model.assetUrl = `/api/assets/${job.id}/glb`
      job.model.message = '3D model ready (Tripo3D)'
      broadcast(job.id)
      return
    }

    if (t.status === 'failed' || t.status === 'cancelled') {
      throw new Error(`Tripo task ${t.status}`)
    }

    job.model.progress = t.progress > 0 ? Math.min(t.progress, 90) : bumpProgress(job.model.progress)
    job.model.message = 'Generating 3D model...'
    broadcast(job.id)
  }
}
