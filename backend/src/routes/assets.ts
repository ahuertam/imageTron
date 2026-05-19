import { Router } from 'express'
import { getAssetBuffer } from '../services/jobStore.js'

const MIME: Record<string, string> = {
  spz: 'application/octet-stream',
  glb: 'model/gltf-binary',
}

const router = Router()

router.get('/:jobId/:type', (req, res) => {
  const { jobId, type } = req.params
  if (!MIME[type]) {
    res.status(400).json({ error: 'Invalid asset type' })
    return
  }

  const buffer = getAssetBuffer(`${jobId}:${type}`)
  if (!buffer) {
    res.status(404).json({ error: 'Asset not ready' })
    return
  }

  res.setHeader('Content-Type', MIME[type])
  res.setHeader('Content-Length', buffer.length)
  res.setHeader('Cache-Control', 'public, max-age=3600')
  res.end(buffer)
})

export default router
