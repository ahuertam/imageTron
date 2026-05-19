export type JobStatus = 'pending' | 'processing' | 'done' | 'error'

export type ModelProvider = 'fal' | 'tripo' | 'stability' | 'replicate' | 'meshy'

export interface SubJobState {
  status: JobStatus
  progress: number
  message: string
  assetUrl?: string
  error?: string
}

export type SSEEventType = 'update' | 'done'

export interface SSEEvent {
  type: SSEEventType
  provider: ModelProvider
  worldLabs: SubJobState
  model: SubJobState
}
