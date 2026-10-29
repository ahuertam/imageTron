import { test } from 'node:test'
import assert from 'node:assert/strict'
import { providerError, redactSecrets } from '../src/services/providerError.js'

test('el mensaje incluye el proveedor y el status', () => {
  const msg = providerError('Meshy', 401, 'unauthorized')
  assert.match(msg, /Meshy/)
  assert.match(msg, /401/)
  assert.match(msg, /unauthorized/)
})

test('redacta una API key que venga en el cuerpo', () => {
  const body = '{"error":"Invalid key WLT-Api-Key: wlt_live_supersecreto123"}'
  const msg = providerError('World Labs', 401, body)

  assert.doesNotMatch(msg, /supersecreto/)
  assert.match(msg, /redactado/)
})

test('redacta un header Authorization con Bearer', () => {
  const out = redactSecrets('Authorization: Bearer r8_misecret_token')
  assert.doesNotMatch(out, /r8_misecret_token/)
})

test('redacta tokens sueltos con prefijo reconocible', () => {
  assert.doesNotMatch(redactSecrets('usando wlt_abc123def456'), /abc123def456/)
  assert.doesNotMatch(redactSecrets('usando sk-abcdefgh12345'), /abcdefgh12345/)
})

test('acorta los cuerpos largos', () => {
  const msg = providerError('FAL', 500, 'x'.repeat(5000))
  assert.ok(msg.length < 400, `mensaje demasiado largo: ${msg.length}`)
})

test('sin body, sólo proveedor y status', () => {
  assert.equal(providerError('Tripo', 503, ''), 'Tripo request failed: 503')
})
