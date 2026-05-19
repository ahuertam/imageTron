import { useState, useEffect } from 'react'
import type { SSEEvent, SubJobState } from '../types.ts'

interface SSEState {
  worldLabs: SubJobState | null
  model: SubJobState | null
  done: boolean
}

const initialSubJob: SubJobState = {
  status: 'pending',
  progress: 0,
  message: 'Waiting...',
}

export function useJobSSE(jobId: string | null): SSEState {
  const [state, setState] = useState<SSEState>({
    worldLabs: initialSubJob,
    model: initialSubJob,
    done: false,
  })

  useEffect(() => {
    if (!jobId) return
    setState({ worldLabs: initialSubJob, model: initialSubJob, done: false })

    const es = new EventSource(`/api/status/${jobId}`)

    es.onmessage = (event: MessageEvent<string>) => {
      const data = JSON.parse(event.data) as SSEEvent
      setState({
        worldLabs: data.worldLabs,
        model: data.model,
        done: data.type === 'done',
      })
      if (data.type === 'done') es.close()
    }

    es.onerror = () => { es.close() }

    return () => es.close()
  }, [jobId])

  return state
}
