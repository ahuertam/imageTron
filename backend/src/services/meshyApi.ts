import { assetBuffers, broadcast } from './jobStore.js'
import { saveAsset, saveMetadata } from './outputStore.js'
import { resizeIfNeeded } from './imageResize.js'
import type { Job } from '../types.js'

const API_BASE = 'https://api.meshy.ai/openapi/v2'
const POLL_INTERVAL = 8_000

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}

function bumpProgress(current: number): number {
  return Math.min(current + 8, 90)
}

export async function startMeshyJob(job: Job): Promise<void> {
  const key = process.env.MESHY_API_KEY
  if (!key) throw new Error('MESHY_API_KEY not set')

  job.model.status = 'processing'
  job.model.message = 'Preparing image...'
  job.model.progress = 5
  broadcast(job.id)

  const { base64, mimeType } = await resizeIfNeeded(job.imageBase64, job.imageMimeType)
  const dataUri = `data:${mimeType};base64,${base64}`

  job.model.message = 'Submitting to Meshy...'
  job.model.progress = 10
  broadcast(job.id)

  const submitResp = await fetch(`${API_BASE}/image-to-3d`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image_url: dataUri,
      enable_pbr: true,
      should_remesh: true,
      should_texture: true,
      topology: 'triangle',
      target_polycount: 30000,
    }),
  })

  if (!submitResp.ok) {
    const text = await submitResp.text()
    throw new Error(`Meshy submit failed: ${submitResp.status} ${text}`)
  }

  const submitData = await submitResp.json() as { result: string }
  const taskId = submitData.result

  job.model.externalOperationId = taskId
  job.model.message = 'Generating 3D model (Meshy)...'
  job.model.progress = 15
  broadcast(job.id)

  // Polling loop
  while (true) {
    await sleep(POLL_INTERVAL)

    const pollResp = await fetch(`${API_BASE}/image-to-3d/${taskId}`, {
      headers: { Authorization: `Bearer ${key}` },
    })

    if (!pollResp.ok) {
      throw new Error(`Meshy poll failed: ${pollResp.status}`)
    }

    const data = await pollResp.json() as {
      status: string
      progress: number
      model_urls?: { glb?: string }
      task_error?: { message: string }
    }

    if (data.status === 'SUCCEEDED') {
      const glbUrl = data.model_urls?.glb
      if (!glbUrl) throw new Error('No GLB URL in Meshy response')

      job.model.message = 'Downloading 3D model...'
      job.model.progress = 90
      broadcast(job.id)

      const fileResp = await fetch(glbUrl)
      if (!fileResp.ok) throw new Error(`GLB download failed: ${fileResp.status}`)

      const buf = Buffer.from(await fileResp.arrayBuffer())
      assetBuffers.set(`${job.id}:glb`, buf)
      saveAsset(job.id, 'model.glb', buf)
      saveMetadata(job, { glb: 'model.glb' })

      job.model.status = 'done'
      job.model.progress = 100
      job.model.assetUrl = `/api/assets/${job.id}/glb`
      job.model.message = '3D model ready (Meshy)'
      broadcast(job.id)
      return
    }

    if (data.status === 'FAILED' || data.status === 'EXPIRED') {
      throw new Error(data.task_error?.message ?? `Meshy task ${data.status}`)
    }

    job.model.progress = data.progress > 0
      ? Math.min(15 + Math.round(data.progress * 0.75), 90)
      : bumpProgress(job.model.progress)
    job.model.message = 'Generating 3D model (Meshy)...'
    broadcast(job.id)
  }
}
