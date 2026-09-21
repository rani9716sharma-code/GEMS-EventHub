import test from 'node:test'
import assert from 'node:assert/strict'
import { startFixture } from './fixture.mjs'

// 1x1 transparent PNG
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

test('event posters are shown publicly through a cached image link', async (t) => {
  const f = await startFixture()
  t.after(() => f.stop())
  const token = f.sessions['Main Coordinator'].token
  const make = async (name, extra) => (await f.ok('/api/events', { token, body: { ...f.eventBody, name, venue: `${name} Hall`, ...extra } })).event

  const withPoster = await make('Poster Event', { poster_url: `data:image/png;base64,${PNG}` })
  const withoutPoster = await make('Plain Event', {})
  const draft = await make('Draft Poster Event', { poster_url: `data:image/png;base64,${PNG}` })
  for (const e of [withPoster, withoutPoster]) await f.ok(`/api/events/${e.id}/publish`, { token, method: 'POST' })

  await t.test('the public list carries a short link, not the whole image', async () => {
    const { rows } = await f.ok('/api/public/events')
    const a = rows.find((r) => r.id === withPoster.id), b = rows.find((r) => r.id === withoutPoster.id)
    assert.match(a.poster_url, new RegExp(`^/api/public/events/${withPoster.id}/poster\\?v=`))
    assert.equal(b.poster_url, null)
    assert.ok(!JSON.stringify(rows).includes('base64'))
  })
  await t.test('the poster link returns the real image with caching headers', async () => {
    const response = await fetch(`${f.origin}/api/public/events/${withPoster.id}/poster`)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-type'), 'image/png')
    assert.match(response.headers.get('cache-control'), /max-age/)
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.from(PNG, 'base64'))
  })
  await t.test('events without a poster and unpublished events return 404', async () => {
    assert.equal((await fetch(`${f.origin}/api/public/events/${withoutPoster.id}/poster`)).status, 404)
    assert.equal((await fetch(`${f.origin}/api/public/events/${draft.id}/poster`)).status, 404)
    assert.equal((await fetch(`${f.origin}/api/public/events/99999/poster`)).status, 404)
  })
})
