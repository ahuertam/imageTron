import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import {
  hashImage,
  ensureOutputDir,
  getCachedAsset,
  saveAsset,
  saveMetadata,
  saveSourceImage,
} from '../src/services/outputStore.js'
import type { Job, ModelProvider } from '../src/types.js'

// La caché se aísla en un tmpdir: outputStore resuelve OUTPUTS_DIR en cada llamada.
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'imagetron-test-'))
process.env.OUTPUTS_DIR = tmpRoot

after(() => fs.rmSync(tmpRoot, { recursive: true, force: true }))

const makeJob = (id: string, overrides: Partial<Job> = {}): Job => ({
  id,
  createdAt: 0,
  imageBase64: '',
  imageMimeType: 'image/jpeg',
  provider: 'replicate' as ModelProvider,
  worldLabs: { status: 'pending', progress: 0, message: '' },
  model: { status: 'pending', progress: 0, message: '' },
  ...overrides,
})

// ── hashImage ─────────────────────────────────────────────────────────────────

test('hashImage devuelve los primeros 16 chars del sha256', () => {
  const buf = Buffer.from('una imagen cualquiera')
  const expected = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16)

  assert.equal(hashImage(buf), expected)
  assert.equal(hashImage(buf).length, 16)
  assert.match(hashImage(buf), /^[0-9a-f]{16}$/)
})

test('hashImage es estable: la misma imagen da siempre la misma clave de caché', () => {
  const buf = Buffer.from('mismos bytes')

  assert.equal(hashImage(buf), hashImage(buf))
  assert.equal(hashImage(buf), hashImage(Buffer.from(buf)))
})

test('hashImage distingue imágenes distintas', () => {
  assert.notEqual(hashImage(Buffer.from('a')), hashImage(Buffer.from('b')))
})

// ── caché en disco ───────────────────────────────────────────────────────────

test('getCachedAsset devuelve null cuando no hay nada cacheado', () => {
  assert.equal(getCachedAsset('hash-inexistente', 'model.glb'), null)
})

test('saveAsset escribe el asset y getCachedAsset lo devuelve idéntico', () => {
  const payload = Buffer.from('contenido del modelo glb')

  const filePath = saveAsset('hash-1', 'model.glb', payload)

  assert.ok(fs.existsSync(filePath))
  assert.deepEqual(getCachedAsset('hash-1', 'model.glb'), payload)
})

test('la caché se aísla por hash de imagen', () => {
  saveAsset('hash-a', 'model.glb', Buffer.from('A'))

  assert.equal(getCachedAsset('hash-b', 'model.glb'), null)
  assert.deepEqual(getCachedAsset('hash-a', 'model.glb'), Buffer.from('A'))
})

test('la caché se aísla por nombre de asset', () => {
  saveAsset('hash-c', 'model.glb', Buffer.from('glb'))

  assert.equal(getCachedAsset('hash-c', 'environment.spz'), null)
  assert.deepEqual(getCachedAsset('hash-c', 'model.glb'), Buffer.from('glb'))
})

test('ensureOutputDir crea el directorio y es idempotente', () => {
  const dir = ensureOutputDir('hash-d')

  assert.ok(fs.existsSync(dir))
  assert.equal(ensureOutputDir('hash-d'), dir)
})

test('saveAsset sobreescribe el asset previo', () => {
  saveAsset('hash-e', 'model.glb', Buffer.from('v1'))
  saveAsset('hash-e', 'model.glb', Buffer.from('v2'))

  assert.deepEqual(getCachedAsset('hash-e', 'model.glb'), Buffer.from('v2'))
})

// ── imagen origen ────────────────────────────────────────────────────────────

test('saveSourceImage guarda la imagen original con su extensión', () => {
  const job = makeJob('hash-src', {
    imageBase64: Buffer.from('bytes de la imagen').toString('base64'),
    imageMimeType: 'image/png',
  })

  saveSourceImage(job)

  assert.deepEqual(getCachedAsset('hash-src', 'source.png'), Buffer.from('bytes de la imagen'))
})

test('saveSourceImage no sobreescribe una imagen ya cacheada', () => {
  const original = makeJob('hash-src-2', {
    imageBase64: Buffer.from('primera imagen').toString('base64'),
    imageMimeType: 'image/jpeg',
  })
  saveSourceImage(original)

  const reupload = makeJob('hash-src-2', {
    imageBase64: Buffer.from('segunda imagen distinta').toString('base64'),
    imageMimeType: 'image/jpeg',
  })
  saveSourceImage(reupload)

  assert.deepEqual(getCachedAsset('hash-src-2', 'source.jpeg'), Buffer.from('primera imagen'))
})

// ── metadata ─────────────────────────────────────────────────────────────────

test('saveMetadata fusiona assets en vez de sobreescribirlos', () => {
  const job = makeJob('hash-meta')

  saveMetadata(job, { spz: 'environment.spz' })
  saveMetadata(job, { glb: 'model.glb' })

  const metaPath = path.join(tmpRoot, 'hash-meta', 'metadata.json')
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))

  assert.equal(meta.id, 'hash-meta')
  assert.equal(meta.provider, 'replicate')
  assert.deepEqual(meta.assets, { spz: 'environment.spz', glb: 'model.glb' })
})

test('saveMetadata tolera un metadata.json corrupto', () => {
  const dir = ensureOutputDir('hash-meta-corrupto')
  fs.writeFileSync(path.join(dir, 'metadata.json'), '{ esto no es json')

  assert.doesNotThrow(() => saveMetadata(makeJob('hash-meta-corrupto'), { glb: 'model.glb' }))

  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'metadata.json'), 'utf8'))
  assert.deepEqual(meta.assets, { glb: 'model.glb' })
})
