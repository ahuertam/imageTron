/**
 * Los errores de los proveedores acaban en la UI (y el SSE no tiene auth), así
 * que el cuerpo de la respuesta no se pasa tal cual: se acorta y se redacta
 * cualquier cosa que parezca una credencial (algunos gateways devuelven la
 * cabecera de auth en el body cuando la key está mal).
 */

const MAX_BODY = 300

export function redactSecrets(text: string): string {
  return text
    // cabeceras tipo "WLT-Api-Key: wlt_xxx" o "Authorization: Bearer xxx"
    .replace(
      /(wlt-api-key|authorization|x-api-key|api[-_]?key|bearer)\s*[:=]?\s*[^\s,;"']+/gi,
      '$1: [redactado]',
    )
    // tokens con prefijo reconocible, aunque vayan sueltos
    .replace(/\b(?:sk|r8|mshy|wlt)[_-][A-Za-z0-9_-]{8,}\b/g, '[redactado]')
}

/** Mensaje de error listo para mandar al cliente. */
export function providerError(provider: string, status: number, body: string): string {
  const clean = redactSecrets(body).replace(/\s+/g, ' ').trim().slice(0, MAX_BODY)
  return clean
    ? `${provider} request failed: ${status} — ${clean}`
    : `${provider} request failed: ${status}`
}
