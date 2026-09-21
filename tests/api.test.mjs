import test from 'node:test'
import assert from 'node:assert/strict'
import { startFixture } from './fixture.mjs'

test('EventHub API workflows use an isolated disposable database', async t => {
  const f = await startFixture()
  t.after(() => f.stop())
  const admin = f.sessions['Super Admin'].token, coordinator = f.sessions['Main Coordinator'].token, student = f.sessions.Student.token, hod = f.sessions.HOD.token
  let registration, resultId, certificate
  await t.test('health, public events, setup protection and role boundaries', async () => {
    assert.equal((await f.request('/api/health')).status, 200)
    assert.equal((await f.ok('/api/public/events')).rows.length, 1)
    assert.equal((await f.request('/api/setup/admin', { body: { name: 'Not allowed' } })).status, 409)
    assert.equal((await f.request('/api/users', { token: student })).status, 403)
    assert.equal((await f.request('/api/admin/operations')).status, 401)
  })
  await t.test('registration, duplicate prevention and attendance', async () => {
    registration = (await f.ok('/api/registrations', { token: student, body: { event_id: f.event.id, registration_type: 'Individual' } })).registration
    assert.equal(registration.status, 'Confirmed')
    assert.equal((await f.request('/api/registrations', { token: student, body: { event_id: f.event.id } })).status, 409)
    await f.ok('/api/coordinator/scanner/check-in', { token: coordinator, body: { event_id: f.event.id, student_id: 'QA-STUDENT-1', method: 'Manual' } })
    const report = await f.ok(`/api/coordinator/reports/attendance?event_id=${f.event.id}`, { token: coordinator })
    assert.equal(report.rows.length, 1)
  })
  await t.test('draft results remain private; published results appear publicly', async () => {
    const result = await f.ok('/api/coordinator/results', { token: coordinator, body: { event_id: f.event.id, registration_id: registration.id, award: '1st Place', position: 1, points_awarded: 100 } })
    resultId = result.id
    assert.equal((await f.ok('/api/public/results')).rows.length, 0)
    await f.ok(`/api/coordinator/results/${resultId}/publish`, { token: coordinator, method: 'POST' })
    assert.equal((await f.ok('/api/results/my', { token: student })).rows.length, 1)
    const published = await f.ok('/api/public/results')
    assert.equal(published.rows[0].participant_name, 'QA Student 1')
    assert.equal(published.rows[0].student_id, undefined)
  })
  await t.test('certificate issue, idempotency, ownership and verification', async () => {
    assert.equal((await f.ok('/api/coordinator/certificates', { token: coordinator, body: { event_id: f.event.id } })).issued, 1)
    assert.equal((await f.ok('/api/coordinator/certificates', { token: coordinator, body: { event_id: f.event.id } })).issued, 0)
    certificate = (await f.ok('/api/certificates/my', { token: student })).rows[0]
    assert.ok(certificate.certificate_id)
    assert.equal((await f.ok('/api/certificates/my', { token: f.sessions['Student 2'].token })).rows.length, 0)
    const verified = await f.ok(`/api/public/certificates/${certificate.certificate_id}`)
    assert.equal(verified.certificate.recipient_name, 'QA Student 1')
    assert.equal(verified.certificate.student_id, undefined)
    assert.equal((await f.request('/api/public/certificates/invalid')).status, 404)
  })
  await t.test('HOD can read department reports but cannot change attendance', async () => {
    for (const path of ['/api/registrations/manage', '/api/coordinator/reports/payments', '/api/coordinator/reports/attendance']) {
      assert.equal((await f.request(`${path}?event_id=${f.event.id}`, { token: hod })).status, 200, path)
    }
    assert.equal((await f.request('/api/coordinator/reports/attendance', { token: hod, method: 'PATCH', body: { event_id: f.event.id } })).status, 403)
  })
  await t.test('role-specific read endpoints return usable responses', async () => {
    const paths = {
      'Super Admin': ['/api/users', '/api/students', '/api/students/stats', '/api/events/manage', '/api/admin/operations', '/api/admin/gallery', '/api/registrations/admin'],
      'Main Coordinator': ['/api/events/manage', '/api/teams/manage', '/api/students', '/api/coordinator/scanner/events', '/api/notifications'],
      'Department Coordinator': ['/api/events/manage', '/api/teams/manage', '/api/students', '/api/coordinator/scanner/events'],
      'HOD': ['/api/events/manage', '/api/students', '/api/notifications'],
      'Student': ['/api/registration-events', '/api/registrations/my', '/api/teams/my', '/api/results/my', '/api/certificates/my', '/api/payments/my', '/api/leaderboard', '/api/notifications', '/api/students/QA-STUDENT-1'],
      'Librarian': ['/api/events/manage', '/api/teams/manage', '/api/coordinator/scanner/events'],
    }
    const failures = []
    for (const [role, endpoints] of Object.entries(paths)) for (const path of endpoints) {
      const { status, data } = await f.request(path, { token: f.sessions[role].token })
      if (status !== 200) failures.push(`${role}: ${path} returned ${status} ${data.error || ''}`)
    }
    assert.deepEqual(failures, [])
  })
  await t.test('capacity waiting list advances after cancellation', async () => {
    const {event} = await f.ok('/api/events',{token:coordinator,body:{...f.eventBody,name:'QA Capacity',venue:'Capacity Hall',capacity:1}})
    await f.ok(`/api/events/${event.id}/publish`,{token:coordinator,method:'POST'})
    const first=(await f.ok('/api/registrations',{token:student,body:{event_id:event.id}})).registration
    const second=(await f.ok('/api/registrations',{token:f.sessions['Student 2'].token,body:{event_id:event.id}})).registration
    assert.equal(second.status,'Waiting List')
    await f.ok(`/api/registrations/${first.id}/cancel`,{token:student,method:'POST'})
    const rows=(await f.ok('/api/registrations/my',{token:f.sessions['Student 2'].token})).rows
    assert.equal(rows.find(row=>row.id===second.id).status,'Confirmed')
  })
  await t.test('offline payment confirms registration and prevents duplicate collection',async()=>{
    const {event}=await f.ok('/api/events',{token:coordinator,body:{...f.eventBody,name:'QA Paid Event',venue:'Payment Hall',payment_type:'Paid',fee:150,offline_payment:true,online_payment:false}})
    await f.ok(`/api/events/${event.id}/publish`,{token:coordinator,method:'POST'})
    const registration=(await f.ok('/api/registrations',{token:student,body:{event_id:event.id}})).registration
    assert.equal(registration.status,'Payment Pending')
    assert.equal((await f.request(`/api/payments/registration/${registration.id}/offline-verify`,{token:student,body:{method:'Cash'}})).status,403)
    await f.ok(`/api/payments/registration/${registration.id}/offline-verify`,{token:coordinator,body:{method:'Cash',notes:'Isolated QA receipt'}})
    assert.equal((await f.request(`/api/payments/registration/${registration.id}/offline-verify`,{token:coordinator,body:{method:'Cash'}})).status,409)
    const rows=(await f.ok('/api/registrations/my',{token:student})).rows
    assert.equal(rows.find(row=>row.id===registration.id).status,'Confirmed')
  })
  await t.test('librarian approval workflow is restricted to owned library events',async()=>{
    const librarian=f.sessions.Librarian.token
    assert.equal((await f.request(`/api/events/${f.event.id}`,{token:librarian})).status,403)
    assert.equal((await f.request(`/api/events/${f.event.id}/complete`,{token:librarian,method:'POST'})).status,403)
    assert.equal((await f.request('/api/events',{token:librarian,body:f.eventBody})).status,400)
    const {event}=await f.ok('/api/events',{token:librarian,body:{...f.eventBody,name:'QA Library Reading',venue:'Library QA',event_scope:'Library'}})
    assert.equal(event.status,'Draft')
    await f.ok(`/api/events/${event.id}/submit`,{token:librarian,method:'POST'})
    await f.ok(`/api/events/${event.id}/approval`,{token:hod,body:{action:'approve'}})
    await f.ok(`/api/events/${event.id}/publish`,{token:librarian,method:'POST'})
    assert.equal((await f.request(`/api/events/${event.id}`,{token:librarian,method:'PATCH',body:{name:'Invalid late edit'}})).status,409)
  })
  await t.test('input validation rejects invalid dates and malformed JSON',async()=>{
    assert.equal((await f.request('/api/events',{token:coordinator,body:{...f.eventBody,event_date:'2026-02-30'}})).status,400)
    const response=await fetch(f.origin+'/api/events',{method:'POST',headers:{Authorization:`Bearer ${coordinator}`,'Content-Type':'application/json'},body:'{'})
    assert.equal(response.status,400)
  })
  await t.test('team-only events support creation, approval and registration',async()=>{
    const {event}=await f.ok('/api/events',{token:coordinator,body:{...f.eventBody,name:'QA Team Event',venue:'Team Hall',participation_type:'Team',team_min:2,team_max:3,allow_coordinator_teams:true,coordinator_team_approval_required:true}})
    await f.ok(`/api/events/${event.id}/publish`,{token:coordinator,method:'POST'})
    const {team}=await f.ok('/api/teams',{token:coordinator,body:{event_id:event.id,team_name:'QA Team',leader_student_id:'QA-STUDENT-1',member_student_ids:['QA-STUDENT-2']}})
    assert.equal(team.members.length,2)
    await f.ok(`/api/teams/${team.id}/submit`,{token:coordinator,method:'POST'})
    await f.ok(`/api/teams/${team.id}/review`,{token:coordinator,body:{action:'approve'}})
    assert.equal((await f.request('/api/registrations',{token:f.sessions['Student 2'].token,body:{event_id:event.id,registration_type:'Team',team_id:team.id}})).status,403)
    const registration=(await f.ok('/api/registrations',{token:student,body:{event_id:event.id,registration_type:'Team',team_id:team.id}})).registration
    assert.equal(registration.status,'Confirmed')
  })
  await t.test('production app serves deep links, assets and missing-file errors',async()=>{
    const response=await fetch(f.origin+'/student/certificates')
    assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/text\/html/)
    assert.match(await response.text(),/<div id="root">/)
    assert.equal((await fetch(f.origin+'/assets/gems-logo.png')).status,200)
    assert.equal((await fetch(f.origin+'/assets/not-found.js')).status,404)
    assert.equal((await f.request('/api/not-found')).status,404)
  })
  await t.test('sign-out revokes the server session', async () => {
    await f.ok('/api/auth/logout', { token: student, method: 'POST' })
    assert.equal((await f.request('/api/auth/me', { token: student })).status, 401)
  })
})
