import type { ServerResponse } from 'node:http'
import type { Job, ModelProvider, SSEEvent, SubJobState } from '../types.js'

const jobs = new Map<string, Job>()
const sseClients = new Map<string, Set<ServerResponse>>()
export const assetBuffers = new Map<string, Buffer>()

function makeSubJob(): SubJobState {
  return { status: 'pending', progress: 0, message: 'Waiting to start...' }
}

export function createJob(id: string, imageBase64: string, imageMimeType: string, provider: ModelProvider): Job {
  const job: Job = {
    id,
    createdAt: Date.now(),
    imageBase64,
    imageMimeType,
    provider,
    worldLabs: makeSubJob(),
    model: makeSubJob(),
  }
  jobs.set(job.id, job)
  return job
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id)
}

export function getAssetBuffer(key: string): Buffer | undefined {
  return assetBuffers.get(key)
}

function isSettled(s: SubJobState): boolean {
  return s.status === 'done' || s.status === 'error'
}

export function isJobSettled(job: Job): boolean {
  return isSettled(job.worldLabs) && isSettled(job.model)
}

/** Único sitio donde se construye el evento SSE: broadcast() y la ruta de status
 *  deben contar exactamente lo mismo (si no, el cliente se queda colgado). */
export function sseEventFor(job: Job): SSEEvent {
  return {
    type: isJobSettled(job) ? 'done' : 'update',
    provider: job.provider,
    worldLabs: job.worldLabs,
    model: job.model,
  }
}

export function broadcast(jobId: string): void {
  const job = jobs.get(jobId)
  if (!job) return

  const bothSettled = isJobSettled(job)
  const event = sseEventFor(job)
  const line = `data: ${JSON.stringify(event)}\n\n`

  const clients = sseClients.get(jobId) ?? new Set()
  for (const res of clients) {
    res.write(line)
    if (bothSettled) res.end()
  }
  if (bothSettled) clients.clear()
}

export function addSSEClient(jobId: string, res: ServerResponse): void {
  if (!sseClients.has(jobId)) sseClients.set(jobId, new Set())
  const set = sseClients.get(jobId)!
  set.add(res)
  res.on('close', () => set.delete(res))
}
