import test from 'node:test'
import assert from 'node:assert/strict'
import { startFixture } from './fixture.mjs'

test('the API can be limited to the website address (GitHub Pages)', async (t) => {
  const f = await startFixture({ EVENTHUB_CORS_ORIGIN: 'https://demo.github.io/' })
  t.after(() => f.stop())
  const preflight = await fetch(`${f.origin}/api/students`, { method: 'OPTIONS', headers: { Origin: 'https://demo.github.io', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' } })
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://demo.github.io')
  assert.match(preflight.headers.get('access-control-allow-headers'), /Authorization/)
  const normal = await fetch(`${f.origin}/api/health`)
  assert.equal(normal.headers.get('access-control-allow-origin'), 'https://demo.github.io')
})
