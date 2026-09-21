import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { startFixture } from './fixture.mjs'
import { startMockSheetsApi } from './mock-google-sheet.mjs'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

test('Google Sheets sync using a Sheet link + service account (no Apps Script)', async (t) => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const email = 'eventhub@demo-project.iam.gserviceaccount.com'
  const key = JSON.stringify({ type: 'service_account', client_email: email, private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }), token_uri: 'https://evil.example.com/token' })
  const google = await startMockSheetsApi({ email, publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }), gridRows: 8 })
  const f = await startFixture({ EVENTHUB_SHEETS_ALLOW_LOCAL: '1', EVENTHUB_SHEETS_API_BASE: google.apiBase, EVENTHUB_SHEETS_TOKEN_URL: google.tokenUrl })
  t.after(async () => { await f.stop(); await google.close() })
  const admin = f.sessions['Super Admin'].token
  const link = `https://docs.google.com/spreadsheets/d/${google.spreadsheetId}/edit#gid=0`
  const patch = (body) => f.request('/api/admin/sheets/config', { token: admin, method: 'PATCH', body })

  await t.test('bad links and keys are explained', async () => {
    assert.match((await patch({ mode: 'api', sheetLink: 'https://example.com/nothing', serviceAccountJson: key })).data.error, /Sheet link/)
    assert.match((await patch({ mode: 'api', sheetLink: link, serviceAccountJson: '{oops' })).data.error, /not valid JSON/)
    assert.match((await patch({ mode: 'api', sheetLink: link, serviceAccountJson: JSON.stringify({ type: 'authorized_user' }) })).data.error, /service account/)
  })

  await t.test('a sheet that is not shared with the service account tells the admin whom to share it with', async () => {
    const r = await patch({ mode: 'api', sheetLink: link, serviceAccountJson: key })
    assert.equal(r.status, 200); assert.equal(r.data.test.ok, false)
    assert.match(r.data.test.error, /Share/); assert.ok(r.data.test.error.includes(email))
    assert.equal(r.data.serviceEmail, email); assert.ok(!JSON.stringify(r.data).includes('PRIVATE KEY'))
  })

  await t.test('once shared, all data is written to the sheet, growing the grid when needed', async () => {
    google.share()
    const test = await f.ok('/api/admin/sheets/test', { token: admin, method: 'POST' })
    assert.equal(test.ok, true); assert.equal(test.spreadsheet, 'GEMS EventHub Data')
    const done = await f.request('/api/admin/sheets/sync', { token: admin, method: 'POST', body: { full: true } })
    assert.equal(done.status, 200); assert.equal(done.data.pending, 0)
    const users = google.tab('Users').rows()
    assert.equal(users[0][1], 'Name'); assert.ok(users.length >= 9, 'more rows than the 8 initial grid rows')
    assert.ok(users.some((row) => row.includes('QA Administrator')))
    assert.equal(google.tab('Students').rows().length, 4)
    const tab = google.tab(f.event.event_code)
    assert.ok(tab && /QA Technical Workshop/.test(tab.name)); assert.equal(tab.rows().length, 1)
    assert.ok(!JSON.stringify(google.sheets.map((s) => s.grid)).match(/password|salt/i))
  })

  await t.test('registrations land in the event tab and updates change the same row', async () => {
    const reg = (await f.ok('/api/registrations', { token: f.sessions.Student.token, body: { event_id: f.event.id, registration_type: 'Individual' } })).registration
    await wait(4600)
    let rows = google.tab(f.event.event_code).rows()
    assert.equal(rows.length, 2); assert.equal(rows[1][rows[0].indexOf('Registration ID')], String(reg.id)); assert.equal(rows[1][rows[0].indexOf('Status')], 'Confirmed')
    await f.ok(`/api/registrations/${reg.id}/cancel`, { token: f.sessions.Student.token, method: 'POST' })
    await wait(4600)
    rows = google.tab(f.event.event_code).rows()
    assert.equal(rows.length, 2); assert.equal(rows[1][rows[0].indexOf('Status')], 'Cancelled')
    assert.equal(google.tab('All Registrations').rows().length, 2)
  })

  await t.test('a full resync does not duplicate rows', async () => {
    await f.ok('/api/admin/sheets/sync', { token: admin, method: 'POST', body: { full: true } })
    const ids = google.tab('Students').rows().slice(1).map((row) => row[0])
    assert.equal(new Set(ids).size, ids.length)
    const regs = google.tab('All Registrations').rows().slice(1).map((row) => row[0])
    assert.equal(new Set(regs).size, regs.length)
  })
})
