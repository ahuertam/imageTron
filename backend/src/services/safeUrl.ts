import dns from 'node:dns/promises'
import net from 'node:net'

/**
 * Guarda contra SSRF.
 *
 * La URL del servidor TRELLIS (y la que devuelve para descargar el .glb) viene
 * del cliente o de un tercero: sin validar, el backend se convierte en un proxy
 * hacia la red interna y devuelve el cuerpo de lo que encuentre.
 *
 * Se permiten direcciones privadas (el caso real es un TRELLIS en la LAN o en
 * localhost) pero se bloquean las rutas que sirven credenciales: link-local
 * (169.254.0.0/16, fe80::/10) y los endpoints de metadata de nube.
 *
 * Nota: la comprobación resuelve el nombre una vez. Un DNS malicioso que
 * cambie la respuesta entre la comprobación y el fetch (DNS rebinding) podría
 * colarse; cerrarlo del todo exige fijar la IP resuelta en el agente HTTP.
 */

const BLOCKED_V4: { base: string; cidr: number; why: string }[] = [
  { base: '169.254.0.0', cidr: 16, why: 'link-local (metadata de nube)' },
  { base: '100.100.100.200', cidr: 32, why: 'metadata de Alibaba Cloud' },
]

function v4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, part) => ((acc << 8) + Number(part)) >>> 0, 0)
}

function isBlockedV4(ip: string): string | null {
  const addr = v4ToInt(ip)
  for (const { base, cidr, why } of BLOCKED_V4) {
    const mask = cidr === 0 ? 0 : (0xffffffff << (32 - cidr)) >>> 0
    if ((addr & mask) === (v4ToInt(base) & mask)) return why
  }
  return null
}

function isBlockedV6(ip: string): string | null {
  const lower = ip.toLowerCase()
  // fe80::/10 (link-local) y fd00:ec2::254 (metadata IPv6 de AWS)
  if (/^fe[89ab]/.test(lower)) return 'link-local IPv6'
  if (lower === 'fd00:ec2::254') return 'metadata IPv6 de AWS'
  return null
}

function checkAddress(address: string): void {
  const family = net.isIP(address)
  if (family === 4) {
    const why = isBlockedV4(address)
    if (why) throw new Error(`Blocked address ${address}: ${why}`)
  } else if (family === 6) {
    const why = isBlockedV6(address)
    if (why) throw new Error(`Blocked address ${address}: ${why}`)
  }
}

/** Valida esquema y dirección resuelta. Devuelve la URL parseada. */
export async function assertSafeUrl(raw: string): Promise<URL> {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error('Invalid URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Unsupported protocol: ${url.protocol}`)
  }

  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (net.isIP(host)) {
    checkAddress(host)
    return url
  }

  let records: { address: string }[]
  try {
    records = await dns.lookup(host, { all: true })
  } catch {
    throw new Error(`Cannot resolve host: ${host}`)
  }
  if (records.length === 0) throw new Error(`Cannot resolve host: ${host}`)
  for (const r of records) checkAddress(r.address)
  return url
}

/**
 * fetch() que valida la URL de destino y cada salto de redirección.
 * La redirección se sigue a mano para poder revalidar en cada paso.
 */
export async function safeFetch(
  raw: string,
  init?: RequestInit,
  maxHops = 3,
): Promise<Response> {
  let current = raw
  for (let hop = 0; hop <= maxHops; hop++) {
    await assertSafeUrl(current)
    const resp = await fetch(current, { ...init, redirect: 'manual' })

    if (resp.status >= 300 && resp.status < 400) {
      const location = resp.headers.get('location')
      if (!location) return resp
      current = new URL(location, current).toString()
      continue
    }
    return resp
  }
  throw new Error('Too many redirects')
}
