import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createJob, getJob, broadcast, isJobSettled, addSSEClient, sseEventFor } from '../src/services/jobStore.js'
import type { ServerResponse } from 'node:http'

/** ServerResponse mínimo que captura lo que se escribe por SSE. */
function fakeRes(): ServerResponse & { written: string; ended: boolean } {
  const res: any = new EventEmitter()
  res.written = ''
  res.ended = false
  res.write = (chunk: string) => { res.written += chunk; return true }
  res.end = () => { res.ended = true; return res }
  return res as ServerResponse & { written: string; ended: boolean }
}

function settle(jobId: string): void {
  const job = getJob(jobId)!
  job.worldLabs = { status: 'done', progress: 100, message: 'ok' }
  job.model = { status: 'done', progress: 100, message: 'ok' }
}

test('un job recién creado no está resuelto', () => {
  const job = createJob('job-nuevo', 'base64', 'image/jpeg', 'meshy')

  assert.equal(isJobSettled(job), false)
})

test('isJobSettled exige que los dos sub-jobs terminen', () => {
  const job = createJob('job-parcial', 'base64', 'image/jpeg', 'meshy')

  job.worldLabs = { status: 'done', progress: 100, message: 'ok' }
  assert.equal(isJobSettled(job), false)

  job.model = { status: 'error', progress: 0, message: '', error: 'boom' }
  assert.equal(isJobSettled(job), true, 'un sub-job en error también cuenta como resuelto')
})

test('broadcast emite type=done cuando los dos sub-jobs están resueltos', () => {
  createJob('job-broadcast', 'base64', 'image/jpeg', 'meshy')

  // con cliente conectado
  const client = fakeRes()
  addSSEClient('job-broadcast', client)

  broadcast('job-broadcast')
  const first = JSON.parse(client.written.trim().split('\n\n')[0].replace('data: ', ''))
  assert.equal(first.type, 'update', 'mientras corre, es update')
  assert.equal(client.ended, false)

  settle('job-broadcast')
  broadcast('job-broadcast')
  const last = JSON.parse(client.written.trim().split('\n\n').pop()!.replace('data: ', ''))
  assert.equal(last.type, 'done')
  assert.equal(client.ended, true, 'cierra la conexión cuando ambos terminan')
})

test('sseEventFor construye el mismo evento que usa el status route', () => {
  const job = createJob('job-event', 'base64', 'image/jpeg', 'tripo')

  const running = sseEventFor(job)
  assert.equal(running.type, 'update')
  assert.equal(running.provider, 'tripo')
  assert.equal(running.worldLabs, job.worldLabs)
  assert.equal(running.model, job.model)

  settle('job-event')
  const settled = sseEventFor(job)
  assert.equal(settled.type, 'done')
  assert.equal(settled.provider, 'tripo')
})
