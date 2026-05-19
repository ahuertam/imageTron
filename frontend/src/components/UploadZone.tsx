import { useRef, useState, useCallback } from 'react'
import type { ModelProvider } from '../types.ts'

interface Props {
  onFile: (file: File, provider: ModelProvider) => void
  isUploading: boolean
  preview: string | null
  localTrellisUrl: string
  onLocalTrellisUrlChange: (url: string) => void
}

const PROVIDERS: { id: ModelProvider; label: string; badge: string; desc: string }[] = [
  { id: 'local', label: 'Local TRELLIS', badge: 'Free', desc: 'Self-hosted · GLB' },
  { id: 'meshy', label: 'Meshy', badge: '200 free/month', desc: '~60s · GLB' },
  { id: 'replicate', label: 'Replicate TRELLIS', badge: 'Pay-per-use', desc: '~25s · GLB' },
  { id: 'tripo', label: 'Tripo3D', badge: 'API credits', desc: '~30s · GLB' },
  { id: 'stability', label: 'Stable Fast 3D', badge: 'Paid', desc: '< 1s · GLB' },
  { id: 'fal', label: 'FAL Hunyuan3D', badge: 'Paid', desc: '~2 min · GLB' },
]

export function UploadZone({ onFile, isUploading, preview, localTrellisUrl, onLocalTrellisUrlChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [provider, setProvider] = useState<ModelProvider>('meshy')
  const [pendingFile, setPendingFile] = useState<File | null>(null)

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return
    setPendingFile(file)
  }, [])

  const handleSubmit = () => {
    if (pendingFile) onFile(pendingFile, provider)
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  const previewUrl = pendingFile ? URL.createObjectURL(pendingFile) : preview

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-md px-4">
      {/* Title */}
      <div className="text-center">
        <div className="flex justify-center mb-3">
          <img
            src="/terminator2.png"
            alt="ImageTron logo"
            className="h-14 w-14 rounded-xl border border-gray-800 bg-black/30 object-cover"
            loading="eager"
          />
        </div>
        <h1 className="text-4xl font-semibold tracking-tight text-white">
          Image<span className="text-violet-400">Tron</span>
        </h1>
        <p className="mt-2 text-sm text-gray-400">Drop an image and watch it become a 3D world</p>
      </div>

      {/* Drop zone */}
      <div
        className={`
          relative w-full aspect-video rounded-2xl border-2 border-dashed cursor-pointer
          transition-all duration-200 flex flex-col items-center justify-center gap-3 overflow-hidden
          ${isDragging ? 'border-violet-400 bg-violet-950/30' : 'border-gray-700 bg-gray-900/50 hover:border-gray-500'}
          ${isUploading ? 'pointer-events-none opacity-60' : ''}
        `}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onClick={() => !isUploading && inputRef.current?.click()}
      >
        {previewUrl ? (
          <img src={previewUrl} alt="Preview" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <>
            <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center">
              <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            </div>
            <p className="text-sm text-gray-400">
              {isDragging ? 'Drop to upload' : 'Drag & drop or click to select'}
            </p>
            <p className="text-xs text-gray-600">PNG, JPG, WebP up to 20 MB</p>
          </>
        )}
        {isUploading && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onInputChange} />
      </div>

      {/* Provider selector */}
      <div className="w-full">
        <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider">3D model provider</p>
        <div className="flex flex-col gap-2">
          {PROVIDERS.map((p) => (
            <div key={p.id} className="flex flex-col gap-1">
              <button
                onClick={() => setProvider(p.id)}
                className={`
                  flex items-center justify-between px-4 py-3 rounded-xl border text-left transition-all
                  ${provider === p.id
                    ? 'border-violet-500 bg-violet-950/40 text-white'
                    : 'border-gray-800 bg-gray-900/40 text-gray-400 hover:border-gray-600'}
                `}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full border-2 ${provider === p.id ? 'border-violet-400 bg-violet-400' : 'border-gray-600'}`} />
                  <span className="text-sm font-medium">{p.label}</span>
                  <span className="text-xs text-gray-500">{p.desc}</span>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  p.badge === 'Paid' ? 'bg-gray-800 text-gray-500'
                  : p.badge === 'Free' ? 'bg-green-900/50 text-green-400'
                  : 'bg-blue-900/50 text-blue-400'
                }`}>
                  {p.badge}
                </span>
              </button>
              {p.id === 'local' && provider === 'local' && (
                <input
                  type="text"
                  value={localTrellisUrl}
                  onChange={(e) => onLocalTrellisUrlChange(e.target.value)}
                  placeholder="http://localhost:8000"
                  className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-500 transition-colors"
                  onClick={(e) => e.stopPropagation()}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Submit button */}
      <button
        onClick={handleSubmit}
        disabled={!pendingFile || isUploading}
        className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium transition-colors"
      >
        {isUploading ? 'Uploading...' : 'Convert to 3D'}
      </button>
    </div>
  )
}
