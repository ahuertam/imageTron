import { Router } from 'express'
import multer from 'multer'
import { createJob, getJob, broadcast, setAssetBuffer, countActiveJobs } from '../services/jobStore.js'
import { hashImage, getCachedAsset, saveSourceImage, saveMetadata, modelAssetName } from '../services/outputStore.js'
import { startWorldLabsJob } from '../services/worldLabs.js'
import { startFalJob } from '../services/falApi.js'
import { startTripoJob } from '../services/tripoApi.js'
import { startStabilityJob } from '../services/stabilityApi.js'
import { startReplicateJob } from '../services/replicateApi.js'
import { startMeshyJob } from '../services/meshyApi.js'
import { startLocalTrellisJob } from '../services/localTrellisApi.js'
import { rateLimit } from '../services/rateLimit.js'
import type { ModelProvider } from '../types.js'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
})

const VALID_PROVIDERS: ModelProvider[] = ['fal', 'tripo', 'stability', 'replicate', 'meshy', 'local']

// Cada job en curso llama a World Labs + a un proveedor de pago: sin tope, una
// racha de peticiones se come la cuota (y la RAM).
const MAX_ACTIVE_JOBS = Number(process.env.MAX_ACTIVE_JOBS ?? 4)

const router = Router()

router.post('/', rateLimit, upload.single('image'), (req, res) => {
  const file = req.file
  if (!file) {
    res.status(400).json({ error: 'No image uploaded' })
    return
  }

  const provider: ModelProvider = VALID_PROVIDERS.includes(req.body.provider as ModelProvider)
    ? (req.body.provider as ModelProvider)
    : 'replicate'

  const localTrellisUrl: string = (req.body.localTrellisUrl as string) || 'http://localhost:8000'

  const imageHash = hashImage(file.buffer)
  const base64 = file.buffer.toString('base64')
  // El jobId lleva el provider: la misma imagen con otro provider es otro job
  // (el .spz se reutiliza, el .glb se regenera).
  const jobId = `${imageHash}-${provider}`

  // Reuse an in-progress job for this hash + provider if it exists
  const existing = getJob(jobId)
  if (existing) {
    res.json({ jobId, provider: existing.provider, cached: false })
    return
  }

  if (countActiveJobs() >= MAX_ACTIVE_JOBS) {
    res.status(503).json({ error: 'Too many generations in progress, try again in a moment' })
    return
  }

  const job = createJob(jobId, imageHash, base64, file.mimetype, provider)
  res.json({ jobId, provider, cached: false })

  saveSourceImage(job)

  // ── World Labs: check cache first ──────────────────────────────────────────
  const cachedSpz = getCachedAsset(imageHash, 'environment.spz')
  if (cachedSpz) {
    setAssetBuffer(`${jobId}:spz`, cachedSpz)
    job.worldLabs.status = 'done'
    job.worldLabs.progress = 100
    job.worldLabs.assetUrl = `/api/assets/${jobId}/spz`
    job.worldLabs.message = 'Environment ready (cached)'
    broadcast(jobId)
  } else {
    startWorldLabsJob(job).catch((err: Error) => {
      job.worldLabs.status = 'error'
      job.worldLabs.error = err.message
      broadcast(job.id)
    })
  }

  // ── 3D model: check cache first ────────────────────────────────────────────
  const glbName = modelAssetName(provider)
  const cachedGlb = getCachedAsset(imageHash, glbName)
  if (cachedGlb) {
    setAssetBuffer(`${jobId}:glb`, cachedGlb)
    job.model.status = 'done'
    job.model.progress = 100
    job.model.assetUrl = `/api/assets/${jobId}/glb`
    job.model.message = '3D model ready (cached)'
    saveMetadata(job, { glb: glbName })
    broadcast(jobId)
  } else {
    const runModel = provider === 'local'
      ? () => startLocalTrellisJob(job, localTrellisUrl)
      : provider === 'fal' ? () => startFalJob(job)
      : provider === 'stability' ? () => startStabilityJob(job)
      : provider === 'replicate' ? () => startReplicateJob(job)
      : provider === 'meshy' ? () => startMeshyJob(job)
      : () => startTripoJob(job)

    runModel().catch((err: Error) => {
      job.model.status = 'error'
      job.model.error = err.message
      broadcast(job.id)
    })
  }
})

export default router
