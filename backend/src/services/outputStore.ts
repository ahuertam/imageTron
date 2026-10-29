import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import type { Job, ModelProvider } from '../types.js'

// ponytail: OUTPUTS_DIR se resuelve en cada llamada (no al importar) para que los tests
// puedan aislar la caché en un tmpdir. Upgrading path: mover a config por entorno si
// aparecen más de un consumidor con roots distintos.
const outputsDir = (): string => process.env.OUTPUTS_DIR || path.resolve('outputs')

/** Nombre del .glb en disco. El entorno (.spz) se comparte entre providers;
 *  el modelo del objeto no, así que cada uno tiene su fichero. */
export function modelAssetName(provider: ModelProvider): string {
  return `model.${provider}.glb`
}

export function hashImage(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 16)
}

export function ensureOutputDir(imageHash: string): string {
  const dir = path.join(outputsDir(), imageHash)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function getCachedAsset(imageHash: string, filename: string): Buffer | null {
  const filePath = path.join(outputsDir(), imageHash, filename)
  if (fs.existsSync(filePath)) return fs.readFileSync(filePath)
  return null
}

export function saveAsset(imageHash: string, filename: string, buffer: Buffer): string {
  const dir = ensureOutputDir(imageHash)
  const filePath = path.join(dir, filename)
  fs.writeFileSync(filePath, buffer)
  return filePath
}

export function saveMetadata(job: Job, extras: Record<string, string> = {}): void {
  const dir = ensureOutputDir(job.imageHash)
  const metaPath = path.join(dir, 'metadata.json')
  // Merge with existing metadata if present (e.g. spz already written, now adding glb)
  let existing: Record<string, unknown> = {}
  if (fs.existsSync(metaPath)) {
    try { existing = JSON.parse(fs.readFileSync(metaPath, 'utf8')) } catch { /* ignore */ }
  }
  const existingAssets = (existing.assets ?? {}) as Record<string, string>
  const meta = {
    ...existing,
    id: job.imageHash,
    updatedAt: new Date().toISOString(),
    assets: { ...existingAssets, ...extras },
    // cada provider genera su propio .glb, así que se listan por separado
    providers: {
      ...((existing.providers ?? {}) as Record<string, unknown>),
      [job.provider]: { model: modelAssetName(job.provider) },
    },
  }
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2))
}

export function saveSourceImage(job: Job): void {
  const ext = job.imageMimeType.split('/')[1] ?? 'jpg'
  const filename = `source.${ext}`
  // Don't overwrite if already cached
  if (!getCachedAsset(job.imageHash, filename)) {
    saveAsset(job.imageHash, filename, Buffer.from(job.imageBase64, 'base64'))
  }
}
