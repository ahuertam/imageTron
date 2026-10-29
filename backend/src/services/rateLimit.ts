import type { Request, Response, NextFunction } from 'express'

// Cada generación cuesta dinero (World Labs + proveedor). Sin límite, cualquiera
// que alcance el endpoint puede vaciar la cuota. Límite por IP y ventana.
const WINDOW_MS = 10 * 60_000
const MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX ?? 10)

interface Hit { count: number; resetAt: number }

const hits = new Map<string, Hit>()

/** Poda las entradas caducadas para que el Map no crezca sin límite. */
function sweep(now: number): void {
  for (const [key, hit] of hits) {
    if (hit.resetAt <= now) hits.delete(key)
  }
}

export function rateLimit(req: Request, res: Response, next: NextFunction): void {
  const now = Date.now()
  if (hits.size > 1000) sweep(now)

  const key = req.ip ?? 'unknown'
  const hit = hits.get(key)

  if (!hit || hit.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS })
    next()
    return
  }

  hit.count++
  if (hit.count > MAX_REQUESTS) {
    res.status(429).json({
      error: 'Too many uploads, try again in a few minutes',
      retryAfterSeconds: Math.ceil((hit.resetAt - now) / 1000),
    })
    return
  }
  next()
}
