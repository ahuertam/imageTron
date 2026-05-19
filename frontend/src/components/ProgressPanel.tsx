import type { ModelProvider, SubJobState } from '../types.ts'

const PROVIDER_LABELS: Record<ModelProvider, string> = {
  fal: 'FAL Hunyuan3D',
  tripo: 'Tripo3D',
  stability: 'Stable Fast 3D',
  replicate: 'Replicate TRELLIS',
  meshy: 'Meshy',
  local: 'Local TRELLIS',
}

const PROVIDER_SUBTITLES: Record<ModelProvider, string> = {
  fal: '3D object model · ~2 min',
  tripo: '3D object model · ~30s',
  stability: '3D object model · < 1s',
  replicate: '3D object model · ~25s',
  meshy: '3D object model · ~60s',
  local: '3D object model · self-hosted',
}

interface TrackProps {
  label: string
  subtitle: string
  state: SubJobState | null
}

function statusIcon(status: SubJobState['status']) {
  if (status === 'done') {
    return (
      <svg className="w-4 h-4 text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    )
  }
  if (status === 'error') {
    return (
      <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    )
  }
  if (status === 'processing') {
    return <div className="w-4 h-4 shrink-0 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
  }
  return <div className="w-4 h-4 shrink-0 rounded-full border-2 border-gray-600" />
}

function Track({ label, subtitle, state }: TrackProps) {
  const s = state ?? { status: 'pending' as const, progress: 0, message: 'Waiting...' }
  const isError = s.status === 'error'

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {statusIcon(s.status)}
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">{label}</p>
            <p className="text-xs text-gray-500">{subtitle}</p>
          </div>
        </div>
        <span className={`text-xs shrink-0 max-w-[140px] text-right ${isError ? 'text-red-400' : 'text-gray-400'}`}>
          {isError ? (s.error ?? 'Error') : s.message}
        </span>
      </div>
      <div className="h-1.5 w-full bg-gray-800 rounded-full overflow-hidden">
        {s.status === 'processing' && s.progress === 0 ? (
          <div className="h-full w-1/3 bg-violet-500 rounded-full animate-[progress_1.5s_ease-in-out_infinite]" />
        ) : (
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              isError ? 'bg-red-500' : s.status === 'done' ? 'bg-green-500' : 'bg-violet-500'
            }`}
            style={{ width: `${s.progress}%` }}
          />
        )}
      </div>
    </div>
  )
}

interface Props {
  worldLabs: SubJobState | null
  model: SubJobState | null
  provider: ModelProvider
  preview: string | null
}

export function ProgressPanel({ worldLabs, model, provider, preview }: Props) {
  return (
    <div className="flex flex-col gap-6 w-full max-w-md px-4">
      <div className="text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-white">
          Image<span className="text-violet-400">Tron</span>
        </h1>
        <p className="mt-1 text-sm text-gray-400">Converting your image to 3D...</p>
      </div>

      {preview && (
        <div className="mx-auto w-20 h-20 rounded-xl overflow-hidden border border-gray-800">
          <img src={preview} alt="Source" className="w-full h-full object-cover" />
        </div>
      )}

      <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-5 flex flex-col gap-5">
        <Track
          label="World Labs"
          subtitle="3D environment (Gaussian splat)"
          state={worldLabs}
        />
        <div className="border-t border-gray-800" />
        <Track
          label={PROVIDER_LABELS[provider]}
          subtitle={PROVIDER_SUBTITLES[provider]}
          state={model}
        />
      </div>

      <p className="text-center text-xs text-gray-600">
        Both jobs run in parallel. The 3D scene appears as assets become ready.
      </p>
    </div>
  )
}
