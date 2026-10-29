import { setAssetBuffer, broadcast } from './jobStore.js'
import { saveAsset, saveMetadata } from './outputStore.js'
import { providerError } from './providerError.js'
import type { Job } from '../types.js'

const API_BASE = 'https://api.worldlabs.ai/marble/v1'
const POLL_INTERVAL = 15_000

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}

function bumpProgress(current: number): number {
  return Math.min(current + 8, 90)
}

export async function startWorldLabsJob(job: Job): Promise<void> {
  const apiKey = process.env.WORLD_LABS_API_KEY
  if (!apiKey) throw new Error('WORLD_LABS_API_KEY not set')

  job.worldLabs.status = 'processing'
  job.worldLabs.message = 'Submitting to World Labs...'
  broadcast(job.id)

  const body = {
    display_name: job.id,
    model: 'marble-1.1',
    world_prompt: {
      type: 'image',
      image_prompt: {
        source: 'data_base64',
        data_base64: job.imageBase64,
        extension: '.jpg',
        mime_type: job.imageMimeType,
      },
    },
  }

  const submitResp = await fetch(`${API_BASE}/worlds:generate`, {
    method: 'POST',
    headers: { 'WLT-Api-Key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!submitResp.ok) {
    const text = await submitResp.text()
    throw new Error(providerError('World Labs', submitResp.status, text))
  }

  const submitData = await submitResp.json() as Record<string, unknown>
  // Response has a `name` field like "operations/abc-123"
  const rawName = (submitData.name ?? submitData.operation_id ?? submitData.id) as string
  const operationId = rawName.includes('/') ? rawName.split('/').pop()! : rawName

  job.worldLabs.externalOperationId = operationId
  job.worldLabs.message = 'Generating 3D environment...'
  job.worldLabs.progress = 5
  broadcast(job.id)

  // Polling loop
  while (true) {
    await sleep(POLL_INTERVAL)

    const pollResp = await fetch(`${API_BASE}/operations/${operationId}`, {
      headers: { 'WLT-Api-Key': apiKey },
    })

    if (!pollResp.ok) {
      job.worldLabs.status = 'error'
      job.worldLabs.error = `Poll failed: ${pollResp.status}`
      broadcast(job.id)
      return
    }

    const data = await pollResp.json() as Record<string, unknown>

    if (data.done) {
      const response = data.response as Record<string, unknown>
      const assets = response.assets as Record<string, unknown>
      const splats = assets.splats as Record<string, unknown>
      const spzUrls = splats.spz_urls as Record<string, string>
      const spzUrl = spzUrls.main ?? Object.values(spzUrls)[0]

      job.worldLabs.message = 'Downloading environment...'
      broadcast(job.id)

      const fileResp = await fetch(spzUrl)
      const buf = Buffer.from(await fileResp.arrayBuffer())
      setAssetBuffer(`${job.id}:spz`, buf)
      saveAsset(job.imageHash, 'environment.spz', buf)
      saveMetadata(job, { spz: 'environment.spz' })

      job.worldLabs.status = 'done'
      job.worldLabs.progress = 100
      job.worldLabs.assetUrl = `/api/assets/${job.id}/spz`
      job.worldLabs.message = 'Environment ready'
      broadcast(job.id)
      return
    }

    job.worldLabs.progress = bumpProgress(job.worldLabs.progress)
    job.worldLabs.message = 'Generating 3D environment...'
    broadcast(job.id)
  }
}
