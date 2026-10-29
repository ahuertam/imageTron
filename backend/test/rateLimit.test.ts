import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { rateLimit } from '../src/services/rateLimit.js'
import type { Request, Response, NextFunction } from 'express'

function fakeReq(ip: string): Request {
  return { ip } as Request
}

function fakeRes(): Response & { statusCode?: number; body?: unknown } {
  const res: any = new EventEmitter()
  res.status = (code: number) => { res.statusCode = code; return res }
  res.json = (body: unknown) => { res.body = body; return res }
  return res
}

test('deja pasar las peticiones dentro del límite', () => {
  let nexted = 0
  const next: NextFunction = () => { nexted++ }

  for (let i = 0; i < 10; i++) {
    rateLimit(fakeReq('1.2.3.4'), fakeRes(), next)
  }
  assert.equal(nexted, 10)
})

test('bloquea con 429 al superar el límite por IP', () => {
  const next: NextFunction = () => {}
  for (let i = 0; i < 10; i++) rateLimit(fakeReq('5.6.7.8'), fakeRes(), next)

  const res = fakeRes()
  rateLimit(fakeReq('5.6.7.8'), res, next)
  assert.equal(res.statusCode, 429)
  assert.match(String((res.body as { error: string }).error), /Too many uploads/)
})

test('el límite es por IP: otra IP no se ve afectada', () => {
  const next: NextFunction = () => {}
  for (let i = 0; i < 12; i++) rateLimit(fakeReq('9.9.9.9'), fakeRes(), next)

  let nexted = 0
  rateLimit(fakeReq('9.9.9.10'), fakeRes(), () => { nexted++ })
  assert.equal(nexted, 1, 'una IP nueva no arrastra el contador de otra')
})
