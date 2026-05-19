import { useState } from 'react'
import { useImageUpload } from './hooks/useImageUpload.ts'
import { useJobSSE } from './hooks/useJobSSE.ts'
import { UploadZone } from './components/UploadZone.tsx'
import { ProgressPanel } from './components/ProgressPanel.tsx'
import { Viewer3D } from './components/Viewer3D.tsx'
import type { ModelProvider } from './types.ts'

type AppState = 'idle' | 'uploading' | 'processing' | 'viewing'

function getAppState(isUploading: boolean, jobId: string | null, done: boolean): AppState {
  if (!jobId && !isUploading) return 'idle'
  if (isUploading) return 'uploading'
  if (done) return 'viewing'
  return 'processing'
}

export default function App() {
  const [provider, setProvider] = useState<ModelProvider>('tripo')
  const { preview, jobId, isUploading, error, upload, reset } = useImageUpload()
  const { worldLabs, model, done } = useJobSSE(jobId)

  const appState = getAppState(isUploading, jobId, done)
  const spzUrl = worldLabs?.assetUrl
  const glbUrl = model?.assetUrl

  const handleFile = (file: File, selectedProvider: ModelProvider) => {
    setProvider(selectedProvider)
    upload(file, selectedProvider)
  }

  return (
    <div className="h-full w-full flex flex-col bg-[#0a0a0f]">
      {appState === 'viewing' && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-3 bg-black/50 backdrop-blur-sm border border-gray-800 rounded-full px-4 py-2">
          <img
            src="/terminator2.png"
            alt="ImageTron logo"
            className="h-7 w-7 rounded-lg border border-gray-800 bg-black/30 object-cover"
            loading="eager"
          />
          <span className="text-sm font-medium text-white">
            Image<span className="text-violet-400">Tron</span>
          </span>
          <div className="w-px h-4 bg-gray-700" />
          <button
            onClick={reset}
            className="text-xs text-gray-400 hover:text-white transition-colors"
          >
            New image
          </button>
        </div>
      )}

      {appState === 'viewing' ? (
        <div className="flex-1">
          <Viewer3D spzUrl={spzUrl} glbUrl={glbUrl} />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center py-8">
          {(appState === 'idle' || appState === 'uploading') && (
            <UploadZone onFile={handleFile} isUploading={isUploading} preview={preview} />
          )}
          {appState === 'processing' && (
            <div className="w-full flex flex-col items-center gap-4">
              <ProgressPanel worldLabs={worldLabs} model={model} provider={provider} preview={preview} />
              {(spzUrl ?? glbUrl) && (
                <div className="w-full max-w-md h-56 rounded-2xl overflow-hidden border border-gray-800">
                  <Viewer3D spzUrl={spzUrl} glbUrl={glbUrl} />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-red-900/80 border border-red-700 text-red-200 text-sm px-4 py-2 rounded-full">
          {error}
        </div>
      )}
    </div>
  )
}
