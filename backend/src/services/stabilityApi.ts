import { setAssetBuffer, broadcast } from './jobStore.js'
import { saveAsset, saveMetadata, modelAssetName } from './outputStore.js'
import { resizeIfNeeded } from './imageResize.js'
import { providerError } from './providerError.js'
import type { Job } from '../types.js'

const API_URL = 'https://api.stability.ai/v2beta/3d/stable-fast-3d'

export async function startStabilityJob(job: Job): Promise<void> {
  const key = process.env.STABILITY_API_KEY
  if (!key) throw new Error('STABILITY_API_KEY not set')

  job.model.status = 'processing'
  job.model.message = 'Preparing image...'
  job.model.progress = 10
  broadcast(job.id)

  const { base64, mimeType } = await resizeIfNeeded(job.imageBase64, job.imageMimeType)

  job.model.message = 'Generating 3D model (Stable Fast 3D)...'
  job.model.progress = 20
  broadcast(job.id)

  const imageBuffer = Buffer.from(base64, 'base64')
  const form = new FormData()
  form.append('image', new Blob([imageBuffer], { type: mimeType }), 'image.jpg')
  form.append('texture_resolution', '1024')
  form.append('foreground_ratio', '0.85')

  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(providerError('Stability', resp.status, text))
  }

  // Stability returns the GLB directly as binary
  job.model.message = 'Downloading 3D model...'
  job.model.progress = 80
  broadcast(job.id)

  const buf = Buffer.from(await resp.arrayBuffer())
  setAssetBuffer(`${job.id}:glb`, buf)
  saveAsset(job.imageHash, modelAssetName(job.provider), buf)
  saveMetadata(job, { glb: modelAssetName(job.provider) })

  job.model.status = 'done'
  job.model.progress = 100
  job.model.assetUrl = `/api/assets/${job.id}/glb`
  job.model.message = '3D model ready (Stable Fast 3D)'
  broadcast(job.id)
}
