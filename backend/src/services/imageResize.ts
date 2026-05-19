import sharp from 'sharp'

// Stability: max 4,194,304 px (≈2048×2048). We target 1024×1024 for all providers
// to keep payloads small and generation fast.
const MAX_PIXELS = 1024 * 1024  // 1 MP — safe for all providers

export async function resizeIfNeeded(
  base64: string,
  mimeType: string,
): Promise<{ base64: string; mimeType: string }> {
  const inputBuf = Buffer.from(base64, 'base64')
  const meta = await sharp(inputBuf).metadata()
  const w = meta.width ?? 0
  const h = meta.height ?? 0

  if (w * h <= MAX_PIXELS) {
    return { base64, mimeType }
  }

  // Fit inside 1024×1024, preserving aspect ratio
  const outBuf = await sharp(inputBuf)
    .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer()

  return { base64: outBuf.toString('base64'), mimeType: 'image/jpeg' }
}
