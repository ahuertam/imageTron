import { Router } from 'express'
import { getJob, addSSEClient } from '../services/jobStore.js'
import type { SSEEvent } from '../types.js'

const router = Router()

router.get('/:jobId', (req, res) => {
  const job = getJob(req.params.jobId)
  if (!job) {
    res.status(404).json({ error: 'Job not found' })
    return
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  // Send current state immediately so client syncs on late connect
  const current: SSEEvent = {
    type: 'update',
    provider: job.provider,
    worldLabs: job.worldLabs,
    model: job.model,
  }
  res.write(`data: ${JSON.stringify(current)}\n\n`)

  addSSEClient(job.id, res as unknown as import('node:http').ServerResponse)
})

export default router
