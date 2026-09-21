import { randomBytes } from 'node:crypto'

/** Explicit public projections never return contact details, logins or student IDs. */
export function createPublicFeatures({ db, json, parseBody, requireAuth, canCoordinateEvent }) {
  return async function handle(req, res, url) {
    if (req.method === 'GET' && url.pathname === '/api/public/results') {
      const rows = db.prepare(`SELECT r.id,r.award,r.position,r.category,r.points_awarded,
        e.name AS event_name,e.event_date,COALESCE(t.team_name,s.name) AS participant_name,
        CASE WHEN r.team_id IS NULL THEN s.department ELSE e.organizing_department END AS department
        FROM results r JOIN events e ON e.id=r.event_id
        LEFT JOIN students s ON s.student_id=r.student_id LEFT JOIN teams t ON t.id=r.team_id
        WHERE r.published=1 ORDER BY date(e.event_date) DESC,e.name,r.position IS NULL,r.position,r.id`).all()
      json(res, 200, { ok: true, rows }); return true
    }
    if (req.method === 'GET' && url.pathname === '/api/public/stats') {
      const events = db.prepare("SELECT COUNT(*) AS count FROM events WHERE status IN ('Published','Registration Open','Ongoing','Completed','Results Published','Certificates Issued')").get().count
      const registrations = db.prepare("SELECT COUNT(*) AS count FROM registrations WHERE status IN ('Confirmed','Payment Pending','Waiting for Approval')").get().count
      const certificates = db.prepare('SELECT COUNT(*) AS count FROM certificates').get().count
      json(res, 200, { ok: true, events, registrations, certificates }); return true
    }
    if (req.method === 'GET' && url.pathname === '/api/public/support') {
      const settings = Object.fromEntries(db.prepare("SELECT key,value FROM app_settings WHERE key IN ('support_email','support_phone')").all().map(row => [row.key, row.value]))
      json(res, 200, { ok: true, ...settings }); return true
    }
    const verification = url.pathname.match(/^\/api\/public\/certificates\/([^/]+)$/)
    if (req.method === 'GET' && verification) {
      const code = decodeURIComponent(verification[1]).trim()
      if (!code || code.length > 120) { json(res, 400, { error: 'Enter a valid certificate ID.' }); return true }
      const certificate = db.prepare(`SELECT c.certificate_id,c.type,c.issued_at,e.name AS event_name,e.event_date,
        COALESCE(s.name,t.team_name) AS recipient_name,c.template_name
        FROM certificates c JOIN events e ON e.id=c.event_id
        LEFT JOIN students s ON s.student_id=c.student_id LEFT JOIN teams t ON t.id=c.team_id
        WHERE c.certificate_id=? OR c.verification_token=?`).get(code, code)
      if (!certificate) { json(res, 404, { error: 'No certificate matches this ID. Check the code and try again.' }); return true }
      json(res, 200, { ok: true, certificate }); return true
    }
    if (req.method === 'GET' && url.pathname === '/api/coordinator/certificates') {
      const auth = requireAuth(req, res, ['Super Admin', 'Main Coordinator', 'Department Coordinator', 'Librarian'])
      if (!auth) return true
      const event = db.prepare('SELECT * FROM events WHERE id=?').get(Number(url.searchParams.get('event_id')))
      if (!event) { json(res, 404, { error: 'Event not found.' }); return true }
      if (!canCoordinateEvent(auth.user, event)) { json(res, 403, { error: 'You do not manage this event.' }); return true }
      const rows = db.prepare(`SELECT c.certificate_id,c.type,c.issued_at,s.name AS recipient_name FROM certificates c
        LEFT JOIN students s ON s.student_id=c.student_id WHERE c.event_id=? ORDER BY c.id DESC`).all(event.id)
      json(res, 200, { ok: true, rows }); return true
    }
    if (req.method === 'POST' && url.pathname === '/api/coordinator/certificates') {
      const auth = requireAuth(req, res, ['Super Admin', 'Main Coordinator', 'Department Coordinator', 'Librarian'])
      if (!auth) return true
      const body = await parseBody(req)
      const eventId = Number(body.event_id)
      const event = db.prepare('SELECT * FROM events WHERE id=?').get(eventId)
      if (!event) { json(res, 404, { error: 'Event not found.' }); return true }
      if (!canCoordinateEvent(auth.user, event)) { json(res, 403, { error: 'You do not manage this event.' }); return true }
      const results = db.prepare('SELECT * FROM results WHERE event_id=? AND published=1').all(eventId)
      if (!results.length) { json(res, 409, { error: 'Publish verified results before issuing certificates.' }); return true }
      let issued = 0
      db.exec('BEGIN IMMEDIATE')
      try {
        for (const result of results) {
          const recipients = result.student_id ? [result.student_id] : db.prepare("SELECT student_id FROM team_members WHERE team_id=? AND status IN ('Accepted','Verified')").all(result.team_id).map(row => row.student_id)
          for (const studentId of recipients) {
            const existing = db.prepare('SELECT id FROM certificates WHERE event_id=? AND student_id=? AND type=?').get(eventId, studentId, result.award)
            if (existing) continue
            const code = `GEH-${randomBytes(10).toString('hex').toUpperCase()}`
            db.prepare('INSERT INTO certificates(certificate_id,event_id,student_id,team_id,type,template_name,verification_token) VALUES (?,?,?,?,?,?,?)')
              .run(code, eventId, studentId, result.team_id || null, result.award, 'GEMS EventHub', code)
            const account = db.prepare("SELECT id FROM users WHERE student_id=? AND role='Student' AND active=1").get(studentId)
            if (account) db.prepare("INSERT INTO notifications(user_id,title,message,channel,target_url,event_id) VALUES (?,?,?,'In-App',?,?)").run(account.id, 'Certificate issued', `Your ${result.award} certificate for ${event.name} is ready.`, '/student/certificates', eventId)
            issued++
          }
        }
        db.prepare('INSERT INTO system_audit(user_id,action,entity_type,entity_id,details) VALUES (?,?,?,?,?)').run(auth.user.id, 'CERTIFICATES_ISSUED', 'Event', String(eventId), `${issued} certificates issued from published results`)
        db.exec('COMMIT')
      } catch (error) { db.exec('ROLLBACK'); throw error }
      json(res, 200, { ok: true, issued, message: issued ? `${issued} certificates issued.` : 'All published results already have certificates.' }); return true
    }
    return false
  }
}
