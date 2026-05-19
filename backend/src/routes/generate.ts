import { Router } from 'express'
import multer from 'multer'
import { createJob, getJob, broadcast, assetBuffers } from '../services/jobStore.js'
import { hashImage, getCachedAsset, saveSourceImage, saveMetadata } from '../services/outputStore.js'
import { startWorldLabsJob } from '../services/worldLabs.js'
import { startFalJob } from '../services/falApi.js'
import { startTripoJob } from '../services/tripoApi.js'
import { startStabilityJob } from '../services/stabilityApi.js'
import { startReplicateJob } from '../services/replicateApi.js'
import { startMeshyJob } from '../services/meshyApi.js'
import type { ModelProvider } from '../types.js'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
})

const VALID_PROVIDERS: ModelProvider[] = ['fal', 'tripo', 'stability', 'replicate', 'meshy']

const router = Router()

router.post('/', upload.single('image'), (req, res) => {
  const file = req.file
  if (!file) {
    res.status(400).json({ error: 'No image uploaded' })
    return
  }

  const provider: ModelProvider = VALID_PROVIDERS.includes(req.body.provider as ModelProvider)
    ? (req.body.provider as ModelProvider)
    : 'replicate'

  const imageHash = hashImage(file.buffer)
  const base64 = file.buffer.toString('base64')

  // Reuse an in-progress job for this hash if it exists
  const existing = getJob(imageHash)
  if (existing) {
    res.json({ jobId: imageHash, provider: existing.provider, cached: false })
    return
  }

  const job = createJob(imageHash, base64, file.mimetype, provider)
  res.json({ jobId: imageHash, provider, cached: false })

  saveSourceImage(job)

  // ── World Labs: check cache first ──────────────────────────────────────────
  const cachedSpz = getCachedAsset(imageHash, 'environment.spz')
  if (cachedSpz) {
    assetBuffers.set(`${imageHash}:spz`, cachedSpz)
    job.worldLabs.status = 'done'
    job.worldLabs.progress = 100
    job.worldLabs.assetUrl = `/api/assets/${imageHash}/spz`
    job.worldLabs.message = 'Environment ready (cached)'
    broadcast(imageHash)
  } else {
    startWorldLabsJob(job).catch((err: Error) => {
      job.worldLabs.status = 'error'
      job.worldLabs.error = err.message
      broadcast(job.id)
    })
  }

  // ── 3D model: check cache first ────────────────────────────────────────────
  const cachedGlb = getCachedAsset(imageHash, 'model.glb')
  if (cachedGlb) {
    assetBuffers.set(`${imageHash}:glb`, cachedGlb)
    job.model.status = 'done'
    job.model.progress = 100
    job.model.assetUrl = `/api/assets/${imageHash}/glb`
    job.model.message = '3D model ready (cached)'
    saveMetadata(job, { glb: 'model.glb' })
    broadcast(imageHash)
  } else {
    const modelRunner =
      provider === 'fal' ? startFalJob
      : provider === 'stability' ? startStabilityJob
      : provider === 'replicate' ? startReplicateJob
      : provider === 'meshy' ? startMeshyJob
      : startTripoJob

    modelRunner(job).catch((err: Error) => {
      job.model.status = 'error'
      job.model.error = err.message
      broadcast(job.id)
    })
  }
})

export default router
