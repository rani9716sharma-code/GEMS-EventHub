import test from 'node:test'
import assert from 'node:assert/strict'
import { startFixture } from './fixture.mjs'
import { startMockGoogle } from './mock-google-sheet.mjs'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

test('Google Sheets sync writes users, students, events and per-event registrations', async (t) => {
  const google = await startMockGoogle()
  const f = await startFixture({ EVENTHUB_SHEETS_ALLOW_LOCAL: '1' })
  t.after(async () => { await f.stop(); await google.close() })
  const admin = f.sessions['Super Admin'].token
  const student = f.sessions.Student.token

  await t.test('only a Super Admin can manage the connection, and bad URLs are refused', async () => {
    assert.equal((await f.request('/api/admin/sheets/status')).status, 401)
    assert.equal((await f.request('/api/admin/sheets/status', { token: student })).status, 403)
    const bad = await f.request('/api/admin/sheets/config', { token: admin, method: 'PATCH', body: { url: 'https://evil.example.com/x', secret: 'abcdefgh1234' } })
    assert.equal(bad.status, 400)
    assert.match(bad.data.error, /script\.google\.com/)
  })

  await t.test('a wrong secret is reported clearly and nothing is written', async () => {
    const r = await f.request('/api/admin/sheets/config', { token: admin, method: 'PATCH', body: { url: google.url, secret: 'wrong-secret-999' } })
    assert.equal(r.status, 200)
    assert.equal(r.data.test.ok, false)
    assert.match(r.data.test.error, /secret/i)
    await f.request('/api/admin/sheets/sync', { token: admin, method: 'POST', body: {} })
    assert.equal(google.tab('Users'), undefined)
  })

  await t.test('connecting with the right secret creates all tabs with data', async () => {
    const r = await f.request('/api/admin/sheets/config', { token: admin, method: 'PATCH', body: { url: google.url, secret: google.secret } })
    assert.equal(r.data.test.ok, true); assert.equal(r.data.test.spreadsheet, 'GEMS EventHub Data')
    const done = await f.request('/api/admin/sheets/sync', { token: admin, method: 'POST', body: { full: true } })
    assert.equal(done.status, 200); assert.equal(done.data.pending, 0)
    const users = google.tab('Users').rows(), students = google.tab('Students').rows(), events = google.tab('Events').rows()
    assert.equal(users[0][1], 'Name'); assert.ok(users.length >= 7) // header + admin + 4 roles + 3 students
    assert.ok(users.some((row) => row.includes('QA Administrator')))
    assert.equal(students.length, 4)
    assert.ok(!JSON.stringify(google.calls).match(/password|salt|token_hash/i), 'secrets must never be sent to Google')
    assert.equal(events.length, 2)
    const tab = google.tab(f.event.event_code)
    assert.ok(tab, 'an event tab exists'); assert.match(tab.getName(), /QA Technical Workshop/)
    assert.equal(tab.rows().length, 1) // header only, no registrations yet
  })

  await t.test('a registration is saved in that event\'s tab and later updates change the same row', async () => {
    const reg = (await f.ok('/api/registrations', { token: student, body: { event_id: f.event.id, registration_type: 'Individual' } })).registration
    await wait(4600)
    let rows = google.tab(f.event.event_code).rows()
    assert.equal(rows.length, 2)
    const header = rows[0], row = rows[1]
    assert.equal(row[header.indexOf('Registration ID')], String(reg.id))
    assert.equal(row[header.indexOf('Student ID')], 'QA-STUDENT-1')
    assert.equal(row[header.indexOf('Name')], 'QA Student 1')
    assert.equal(row[header.indexOf('Status')], 'Confirmed')
    assert.equal(google.tab('All Registrations').rows().length, 2)
    await f.ok(`/api/registrations/${reg.id}/cancel`, { token: student, method: 'POST' })
    await wait(4600)
    rows = google.tab(f.event.event_code).rows()
    assert.equal(rows.length, 2, 'the same row is updated, not duplicated')
    assert.equal(rows[1][rows[0].indexOf('Status')], 'Cancelled')
  })

  await t.test('a new student appears in the Students and Users tabs', async () => {
    await f.ok('/api/students', { token: admin, body: { student_id: 'QA-NEW-9', name: 'Sheet Test Student', department: 'CSE', year: 1, semester: 1, email: 'new9@example.test', create_login: true, password: 'Str0ng-Passw0rd!x', confirm_password: 'Str0ng-Passw0rd!x' } })
    await wait(4600)
    assert.ok(google.tab('Students').rows().some((row) => row.includes('QA-NEW-9')))
    assert.ok(google.tab('Users').rows().some((row) => row.includes('Sheet Test Student')))
  })

  await t.test('when Google is unreachable nothing is lost: it recovers on the next sync', async () => {
    google.setFailing(true)
    await f.ok('/api/students', { token: admin, body: { student_id: 'QA-LATE-7', name: 'Offline Student', department: 'Civil', year: 2, semester: 3 } })
    const failed = await f.request('/api/admin/sheets/sync', { token: admin, method: 'POST', body: {} })
    assert.equal(failed.status, 502)
    const status = (await f.ok('/api/admin/sheets/status', { token: admin }))
    assert.ok(status.lastError); assert.ok(status.pending >= 1)
    google.setFailing(false)
    const recovered = await f.request('/api/admin/sheets/sync', { token: admin, method: 'POST', body: {} })
    assert.equal(recovered.status, 200); assert.equal(recovered.data.pending, 0)
    assert.ok(google.tab('Students').rows().some((row) => row.includes('QA-LATE-7')))
  })

  await t.test('a full resync never duplicates rows', async () => {
    await f.ok('/api/admin/sheets/sync', { token: admin, method: 'POST', body: { full: true } })
    const ids = google.tab('Students').rows().slice(1).map((row) => row[0])
    assert.equal(new Set(ids).size, ids.length)
  })

  await t.test('disconnecting stops syncing and clears the saved secret', async () => {
    const r = await f.ok('/api/admin/sheets/config', { token: admin, method: 'DELETE' })
    assert.equal(r.connected, false)
  })
})
