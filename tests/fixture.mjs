import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'

export async function startFixture(extraEnv = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'eventhub-qa-'))
  const process = spawn(globalThis.process.execPath, ['server/index.mjs'], {
    cwd: resolve('.'), env: { ...globalThis.process.env, EVENTHUB_API_PORT: '0', EVENTHUB_DATA_DIR: directory, ...extraEnv }, stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = '', errors = ''
  process.stderr.on('data', chunk => { errors += chunk })
  const port = await new Promise((resolvePort, reject) => {
    const timer = setTimeout(() => reject(new Error(`Test API did not start: ${errors}`)), 10000)
    process.once('exit', code => { clearTimeout(timer); reject(new Error(`Test API exited (${code}): ${errors}`)) })
    process.stdout.on('data', chunk => { output += chunk; const match = output.match(/http:\/\/[^:]+:(\d+)/); if (match) { clearTimeout(timer); resolvePort(Number(match[1])) } })
  })
  const origin = `http://127.0.0.1:${port}`
  async function request(path, { token, body, method = body ? 'POST' : 'GET' } = {}) {
    const response = await fetch(origin + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
    return { status: response.status, data: await response.json() }
  }
  async function ok(path, options) { const result = await request(path, options); if (result.status >= 400) throw new Error(`${path}: ${result.status} ${JSON.stringify(result.data)}`); return result.data }
  const password = randomBytes(16).toString('hex')
  const admin = await ok('/api/setup/admin', { body: { name: 'QA Administrator', email: 'admin@example.test', password } })
  const sessions = { 'Super Admin': admin }
  for (const [index, role] of ['Main Coordinator', 'Department Coordinator', 'HOD', 'Librarian'].entries()) {
    const email = `role${index}@example.test`
    await ok('/api/users', { token: admin.token, body: { name: `QA ${role}`, email, role, department: 'CSE', password } })
    sessions[role] = await ok('/api/auth/login', { body: { identifier: email, password } })
  }
  for (const number of [1, 2, 3]) {
    const id = `QA-STUDENT-${number}`
    await ok('/api/students', { token: admin.token, body: { student_id: id, name: `QA Student ${number}`, department: number === 3 ? 'Civil' : 'CSE', year: 2, semester: 3, email: `student${number}@example.test`, create_login: true, password, confirm_password: password } })
    sessions[number === 1 ? 'Student' : `Student ${number}`] = await ok('/api/auth/login', { body: { identifier: id, password } })
  }
  const date = new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10)
  const eventBody = { name: 'QA Technical Workshop', category: 'Technical Event', organizing_department: 'CSE', event_scope: 'College', event_date: date, start_time: '10:00', end_time: '12:00', venue: 'QA Hall', capacity: 20, participation_type: 'Individual', payment_type: 'Free', registration_approval_required: false, eligible_departments: ['CSE', 'Civil'], eligible_years: [2] }
  const { event } = await ok('/api/events', { token: sessions['Main Coordinator'].token, body: eventBody })
  await ok(`/api/events/${event.id}/publish`, { token: sessions['Main Coordinator'].token, method: 'POST' })
  return { directory, origin, request, ok, sessions, event, eventBody, errors: () => errors, async stop() {
    if (process.exitCode === null) { const exited = new Promise(resolveExit => process.once('exit', resolveExit)); process.kill('SIGTERM'); await exited }
    rmSync(directory, { recursive: true, force: true })
  } }
}
