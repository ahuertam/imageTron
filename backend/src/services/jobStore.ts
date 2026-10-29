import type { ServerResponse } from 'node:http'
import type { Job, ModelProvider, SSEEvent, SubJobState } from '../types.js'

const jobs = new Map<string, Job>()
const sseClients = new Map<string, Set<ServerResponse>>()
export const assetBuffers = new Map<string, Buffer>()

// Los tres Map crecían sin límite: cada imagen se quedaba con su base64 y
// con el .spz/.glb en memoria para siempre. Se acotan por TTL y por tamaño.
const JOB_TTL_MS = 60 * 60_000        // 1 h
const MAX_JOBS = 200
const MAX_ASSET_BUFFERS = 32           // cada .spz son ~7 MB

function makeSubJob(): SubJobState {
  return { status: 'pending', progress: 0, message: 'Waiting to start...' }
}

export function createJob(
  id: string,
  imageHash: string,
  imageBase64: string,
  imageMimeType: string,
  provider: ModelProvider,
): Job {
  const job: Job = {
    id,
    imageHash,
    createdAt: Date.now(),
    imageBase64,
    imageMimeType,
    provider,
    worldLabs: makeSubJob(),
    model: makeSubJob(),
  }
  jobs.set(job.id, job)
  evictJobs()
  return job
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id)
}

export function getAssetBuffer(key: string): Buffer | undefined {
  return assetBuffers.get(key)
}

/** Jobs resueltos más antiguos que la TTL, y recorte por tamaño. */
function evictJobs(): void {
  const now = Date.now()
  for (const [id, job] of jobs) {
    if (now - job.createdAt > JOB_TTL_MS) jobs.delete(id)
  }
  // por si hay many imágenes simultáneas, se corta por los más antiguos
  while (jobs.size > MAX_JOBS) {
    const oldest = jobs.keys().next().value
    if (oldest === undefined) break
    jobs.delete(oldest)
  }
}

/** Nº de jobs todavía en curso (suman dinero:World Labs + proveedor). */
export function countActiveJobs(): number {
  let n = 0
  for (const job of jobs.values()) {
    if (!isJobSettled(job)) n++
  }
  return n
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
  if (bothSettled) {
    clients.clear()
    sseClients.delete(jobId)
  }
}

export function addSSEClient(jobId: string, res: ServerResponse): void {
  if (!sseClients.has(jobId)) sseClients.set(jobId, new Set())
  const set = sseClients.get(jobId)!
  set.add(res)
  res.on('close', () => {
    set.delete(res)
    if (set.size === 0) sseClients.delete(jobId)
  })
}

/** Guarda el asset en memoria con tope de tamaño: los .spz pesan varios MB. */
export function setAssetBuffer(key: string, buffer: Buffer): void {
  assetBuffers.set(key, buffer)
  while (assetBuffers.size > MAX_ASSET_BUFFERS) {
    const oldest = assetBuffers.keys().next().value
    if (oldest === undefined) break
    assetBuffers.delete(oldest)
  }
}
