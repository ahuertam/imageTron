export type JobStatus = 'pending' | 'processing' | 'done' | 'error'

export type ModelProvider = 'fal' | 'tripo' | 'stability' | 'replicate' | 'meshy' | 'local'

export interface SubJobState {
  status: JobStatus
  progress: number
  message: string
  assetUrl?: string
  error?: string
  externalOperationId?: string
}

export interface Job {
  id: string
  /** Hash de la imagen: carpeta de caché en disco, compartida entre providers */
  imageHash: string
  createdAt: number
  imageBase64: string
  imageMimeType: string
  provider: ModelProvider
  worldLabs: SubJobState
  model: SubJobState
}

export type SSEEventType = 'update' | 'done'

export interface SSEEvent {
  type: SSEEventType
  provider: ModelProvider
  worldLabs: SubJobState
  model: SubJobState
}
