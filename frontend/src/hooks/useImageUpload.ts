import { useState, useCallback } from 'react'
import type { ModelProvider } from '../types.ts'

interface UploadState {
  preview: string | null
  jobId: string | null
  isUploading: boolean
  error: string | null
}

export function useImageUpload() {
  const [state, setState] = useState<UploadState>({
    preview: null,
    jobId: null,
    isUploading: false,
    error: null,
  })

  const upload = useCallback(async (file: File, provider: ModelProvider, localTrellisUrl?: string) => {
    const preview = URL.createObjectURL(file)
    setState({ preview, jobId: null, isUploading: true, error: null })

    try {
      const form = new FormData()
      form.append('image', file)
      form.append('provider', provider)
      if (provider === 'local' && localTrellisUrl) {
        form.append('localTrellisUrl', localTrellisUrl)
      }

      const resp = await fetch('/api/generate', { method: 'POST', body: form })
      if (!resp.ok) throw new Error(`Server error: ${resp.status}`)

      const { jobId } = await resp.json() as { jobId: string }
      setState((s) => ({ ...s, jobId, isUploading: false }))
    } catch (err) {
      setState((s) => ({
        ...s,
        isUploading: false,
        error: err instanceof Error ? err.message : 'Upload failed',
      }))
    }
  }, [])

  const reset = useCallback(() => {
    setState({ preview: null, jobId: null, isUploading: false, error: null })
  }, [])

  return { ...state, upload, reset }
}
