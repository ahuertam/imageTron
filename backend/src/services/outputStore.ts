import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import type { Job } from '../types.js'

const OUTPUTS_DIR = path.resolve('outputs')

export function hashImage(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 16)
}

export function ensureOutputDir(imageHash: string): string {
  const dir = path.join(OUTPUTS_DIR, imageHash)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function getCachedAsset(imageHash: string, filename: string): Buffer | null {
  const filePath = path.join(OUTPUTS_DIR, imageHash, filename)
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
  const dir = ensureOutputDir(job.id)
  const metaPath = path.join(dir, 'metadata.json')
  // Merge with existing metadata if present (e.g. spz already written, now adding glb)
  let existing: Record<string, unknown> = {}
  if (fs.existsSync(metaPath)) {
    try { existing = JSON.parse(fs.readFileSync(metaPath, 'utf8')) } catch { /* ignore */ }
  }
  const meta = {
    ...existing,
    id: job.id,
    updatedAt: new Date().toISOString(),
    provider: job.provider,
    assets: { ...(existing.assets as object ?? {}), ...extras },
  }
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2))
}

export function saveSourceImage(job: Job): void {
  const ext = job.imageMimeType.split('/')[1] ?? 'jpg'
  const filename = `source.${ext}`
  // Don't overwrite if already cached
  if (!getCachedAsset(job.id, filename)) {
    saveAsset(job.id, filename, Buffer.from(job.imageBase64, 'base64'))
  }
}
