import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertSafeUrl, safeFetch } from '../src/services/safeUrl.js'

test('rechaza esquemas que no son http(s)', async () => {
  await assert.rejects(() => assertSafeUrl('file:///etc/passwd'), /Unsupported protocol/)
  await assert.rejects(() => assertSafeUrl('gopher://example.com/'), /Unsupported protocol/)
})

test('rechaza URLs mal formadas', async () => {
  await assert.rejects(() => assertSafeUrl('no es una url'), /Invalid URL/)
})

test('rechaza el endpoint de metadata de nube (link-local)', async () => {
  await assert.rejects(() => assertSafeUrl('http://169.254.169.254/latest/meta-data/'), /Blocked address/)
  await assert.rejects(() => assertSafeUrl('http://169.254.0.1/'), /Blocked address/)
})

test('rechaza el metadata IPv6 de AWS', async () => {
  await assert.rejects(() => assertSafeUrl('http://[fd00:ec2::254]/latest/'), /Blocked address/)
})

test('rechaza el metadata de Alibaba Cloud', async () => {
  await assert.rejects(() => assertSafeUrl('http://100.100.100.200/'), /Blocked address/)
})

test('acepta loopback y direcciones privadas (el caso de uso real)', async () => {
  await assert.doesNotThrow(() => assertSafeUrl('http://localhost:8000'))
  await assert.doesNotThrow(() => assertSafeUrl('http://127.0.0.1:8000'))
  await assert.doesNotThrow(() => assertSafeUrl('http://192.168.1.50:8000'))
})

test('acepta un host público normal', async () => {
  await assert.doesNotThrow(() => assertSafeUrl('https://example.com/predictions'))
})

test('safeFetch no sigue una redirección hacia metadata', async () => {
  await assert.rejects(
    () => safeFetch('http://localhost:9/redirect'),
    /ECONNREFUSED|fetch failed/,
  )
})
