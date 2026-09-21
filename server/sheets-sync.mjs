// Google Sheets sync for GEMS EventHub.
//
// How it works
//  * The database stays the single source of truth. Google Sheets is a live, read-only copy.
//  * After any change (registration, payment, attendance, new user...) the server builds a
//    fresh snapshot of the data that belongs in the sheets and compares a hash of every row
//    with what was last confirmed by Google. Only new/changed rows are sent, so nothing is
//    ever sent twice and nothing is lost if Google or the internet is down: unsent rows are
//    simply retried on the next run.
//  * The receiver is a small Google Apps Script bound to your spreadsheet (google-sheets/Code.gs).
//    No Google Cloud project, API key or service account is needed.
//
// Tabs created in the spreadsheet
//  Users, Students, Events, All Registrations and one tab per event: "<EVENT CODE> <name>".
//  Passwords, password hashes and session tokens are never sent.
import { createHash, createSign } from 'node:crypto'

const ALLOWED_HOSTS = new Set(['script.google.com', 'script.googleusercontent.com'])
const BATCH_SIZE = 150
const DEBOUNCE_MS = 4000
const SAFETY_INTERVAL_MS = 5 * 60 * 1000
const REQUEST_TIMEOUT_MS = 60_000

const text = (value) => (value === null || value === undefined ? '' : String(value))
const num = (value) => (value === null || value === undefined || value === '' ? '' : Number(value))
const yesNo = (value) => (value ? 'Yes' : 'No')
const hash = (value) => createHash('sha1').update(JSON.stringify(value)).digest('hex')

export function validateWebhookUrl(raw, { allowLocal = false } = {}) {
  let url
  try { url = new URL(String(raw || '').trim()) } catch { return { ok: false, error: 'Enter the full Web app URL that Google gave you (it starts with https://script.google.com/).' } }
  if (allowLocal && ['127.0.0.1', 'localhost'].includes(url.hostname)) return { ok: true, url: url.toString() }
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname)) return { ok: false, error: 'The URL must start with https://script.google.com/ (copy it from Deploy > Manage deployments > Web app).' }
  return { ok: true, url: url.toString() }
}

// Accepts a full Google Sheet link or just the sheet ID.
export function parseSpreadsheetId(raw) {
  const value = String(raw || '').trim()
  const fromLink = value.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{15,})/)
  if (fromLink) return fromLink[1]
  return /^[a-zA-Z0-9_-]{25,}$/.test(value) ? value : ''
}

// Reads the key file downloaded from Google Cloud (Service account > Keys > JSON).
export function parseServiceAccount(raw) {
  let data
  try { data = typeof raw === 'string' ? JSON.parse(raw) : raw } catch { return { ok: false, error: 'The key is not valid JSON. Open the downloaded .json file and paste ALL of its text.' } }
  if (!data || data.type !== 'service_account' || !data.client_email || !String(data.private_key || '').includes('BEGIN PRIVATE KEY')) {
    return { ok: false, error: 'This does not look like a Google service account key. Create a key of type JSON for a service account and paste the whole file.' }
  }
  return { ok: true, account: { type: 'service_account', client_email: String(data.client_email), private_key: String(data.private_key) } }
}

export function createSheetsSync({ db, log = console, env = process.env }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS integration_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS sheet_sync_state (
      sheet_key TEXT NOT NULL, row_key TEXT NOT NULL, row_hash TEXT NOT NULL, synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (sheet_key, row_key)
    );
  `)
  const allowLocal = env.EVENTHUB_SHEETS_ALLOW_LOCAL === '1'
  const state = { running: false, promise: null, dirty: false, timer: null, retryTimer: null, failures: 0, lastRunAt: null, lastSuccessAt: null, lastError: null, lastResult: null }
  let configCache = null
  let tokenCache = null

  // ---------- configuration ----------
  function readSetting(key) { return db.prepare('SELECT value FROM integration_settings WHERE key=?').get(key)?.value ?? null }
  function writeSetting(key, value) {
    db.prepare('INSERT INTO integration_settings(key,value,updated_at) VALUES (?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP').run(key, value)
    configCache = null
  }
  function getConfig() {
    if (configCache && Date.now() - configCache.at < 3000) return configCache.value
    const enabled = readSetting('sheets_enabled') !== '0'
    const envUrl = text(env.GOOGLE_SHEETS_WEBHOOK_URL).trim(), envSecret = text(env.GOOGLE_SHEETS_SECRET).trim()
    const envSheet = parseSpreadsheetId(env.GOOGLE_SHEETS_SPREADSHEET_ID), envKey = text(env.GOOGLE_SERVICE_ACCOUNT_JSON).trim()
    let value = null
    if (envUrl && envSecret) value = { mode: 'script', source: 'environment', url: envUrl, secret: envSecret, enabled }
    else if (envSheet && envKey && parseServiceAccount(envKey).ok) value = { mode: 'api', source: 'environment', spreadsheetId: envSheet, account: parseServiceAccount(envKey).account, enabled }
    else if (readSetting('sheets_mode') === 'api') {
      const id = readSetting('sheets_spreadsheet_id'), key = parseServiceAccount(readSetting('sheets_service_account') || '')
      if (id && key.ok) value = { mode: 'api', source: 'settings', spreadsheetId: id, account: key.account, enabled }
    } else {
      const url = readSetting('sheets_url'), secret = readSetting('sheets_secret')
      if (url && secret) value = { mode: 'script', source: 'settings', url, secret, enabled }
    }
    configCache = { at: Date.now(), value }
    return value
  }
  const isActive = () => { const c = getConfig(); return Boolean(c && c.enabled) }
  const destinationOf = (config) => (config.mode === 'api' ? `api:${config.spreadsheetId}` : `script:${config.url}`)

  // Changing the destination spreadsheet means everything must be sent again to the new place.
  function rememberDestination(config) {
    const next = destinationOf(config)
    if (readSetting('sheets_destination') !== next) db.prepare('DELETE FROM sheet_sync_state').run()
    writeSetting('sheets_destination', next)
  }

  function saveConfig(input) {
    const current = getConfig()
    if (current?.source === 'environment') return { ok: false, error: 'The connection is set by server environment variables (GOOGLE_SHEETS_*). Change it there.' }
    const mode = input.mode === 'api' ? 'api' : 'script'
    const enabled = input.enabled === false ? '0' : '1'
    if (mode === 'api') {
      const id = parseSpreadsheetId(input.sheetLink || readSetting('sheets_spreadsheet_id'))
      if (!id) return { ok: false, error: 'Paste the Google Sheet link (the address of the sheet in your browser, containing /spreadsheets/d/…).' }
      const rawKey = text(input.serviceAccountJson).trim() || readSetting('sheets_service_account') || ''
      if (!rawKey) return { ok: false, error: 'Paste the service account key (the whole JSON file).' }
      const key = parseServiceAccount(rawKey)
      if (!key.ok) return key
      writeSetting('sheets_mode', 'api'); writeSetting('sheets_spreadsheet_id', id); writeSetting('sheets_service_account', JSON.stringify(key.account)); writeSetting('sheets_enabled', enabled)
      rememberDestination({ mode: 'api', spreadsheetId: id })
      return { ok: true }
    }
    const checked = validateWebhookUrl(input.url ?? readSetting('sheets_url'), { allowLocal })
    if (!checked.ok) return checked
    const nextSecret = text(input.secret).trim() || readSetting('sheets_secret')
    if (!nextSecret || nextSecret.length < 8) return { ok: false, error: 'Enter the secret you typed into the Google script (at least 8 characters).' }
    writeSetting('sheets_mode', 'script'); writeSetting('sheets_url', checked.url); writeSetting('sheets_secret', nextSecret); writeSetting('sheets_enabled', enabled)
    rememberDestination({ mode: 'script', url: checked.url })
    return { ok: true }
  }
  function clearConfig() {
    for (const key of ['sheets_mode', 'sheets_url', 'sheets_secret', 'sheets_spreadsheet_id', 'sheets_service_account', 'sheets_enabled', 'sheets_destination']) db.prepare('DELETE FROM integration_settings WHERE key=?').run(key)
    db.prepare('DELETE FROM sheet_sync_state').run()
    configCache = null; tokenCache = null
    Object.assign(state, { lastError: null, lastResult: null, failures: 0 })
  }

  // ---------- snapshot of everything that belongs in the sheets ----------
  const USERS_HEADERS = ['User ID', 'Name', 'Email', 'College ID', 'Role', 'Department', 'Student ID', 'Active', 'Created At', 'Updated At']
  const STUDENT_HEADERS = ['Student ID', 'Name', 'Department', 'Year', 'Semester', 'Batch', 'Roll No', 'Email', 'Phone', 'Status', 'Barcode', 'Has Login', 'Created At', 'Updated At']
  const EVENT_HEADERS = ['Event Code', 'Event Name', 'Category', 'Department', 'Scope', 'Date', 'Start', 'End', 'Venue', 'Capacity', 'Registration Mode', 'Payment', 'Fee', 'Status', 'Active Registrations', 'Confirmed', 'Checked In', 'Created At']
  const REG_HEADERS = ['Registration ID', 'Student ID', 'Name', 'Department', 'Year', 'Email', 'Phone', 'Type', 'Team', 'Team Members', 'Status', 'Payment Status', 'Amount', 'Payment Method', 'Receipt No', 'Registered At', 'Source', 'Attendance', 'Check-in Time', 'Result', 'Position']
  const ALL_REG_HEADERS = ['Registration ID', 'Event Code', 'Event Name', ...REG_HEADERS.slice(1)]
  const TEXT_COLUMNS = new Set(['User ID', 'College ID', 'Student ID', 'Batch', 'Roll No', 'Phone', 'Barcode', 'Receipt No', 'Event Code', 'Date', 'Start', 'End', 'Created At', 'Updated At', 'Registered At', 'Check-in Time', 'Registration ID'])
  const textColumnsFor = (headers) => headers.map((h, i) => (TEXT_COLUMNS.has(h) ? i : -1)).filter((i) => i >= 0)

  function tabTitle(event) {
    const name = text(event.name).replace(/[[\]*?:/\\]/g, '-').replace(/\s+/g, ' ').trim()
    return `${event.event_code} ${name}`.slice(0, 95).trim()
  }

  function buildSnapshot() {
    const sheets = new Map()
    const add = (key, title, headers, rows) => sheets.set(key, { key, title, headers, textColumns: textColumnsFor(headers), rows: new Map(rows.map((r) => [text(r[0]), r])) })

    const students = db.prepare('SELECT * FROM students ORDER BY student_id').all()
    const studentById = new Map(students.map((s) => [s.student_id, s]))
    const users = db.prepare('SELECT id,name,email,college_id,role,department,student_id,active,created_at,updated_at FROM users ORDER BY id').all()
    const loginStudents = new Set(users.map((u) => u.student_id).filter(Boolean))

    add('Users', 'Users', USERS_HEADERS, users.map((u) => [u.id, u.name, u.email, u.college_id, u.role, u.department, u.student_id, yesNo(u.active), u.created_at, u.updated_at].map((v, i) => (i === 0 ? text(v) : text(v)))))
    add('Students', 'Students', STUDENT_HEADERS, students.map((s) => [s.student_id, s.name, s.department, num(s.year), num(s.semester), s.batch, s.roll_no, s.email, s.phone, s.status, s.barcode_value, yesNo(loginStudents.has(s.student_id)), s.created_at, s.updated_at].map((v, i) => (typeof v === 'number' ? v : text(v)))))

    const events = db.prepare('SELECT * FROM events ORDER BY id').all()
    const regs = db.prepare('SELECT * FROM registrations ORDER BY id').all()
    const payments = db.prepare('SELECT * FROM payments ORDER BY id').all()
    const attendance = db.prepare('SELECT * FROM attendance').all()
    const results = db.prepare('SELECT * FROM results').all()
    const teams = db.prepare('SELECT * FROM teams').all()
    const members = db.prepare("SELECT * FROM team_members WHERE status != 'Declined'").all()

    const teamById = new Map(teams.map((t) => [t.id, t]))
    const membersByTeam = new Map()
    for (const m of members) { if (!membersByTeam.has(m.team_id)) membersByTeam.set(m.team_id, []); membersByTeam.get(m.team_id).push(m) }
    const paymentByReg = new Map()
    for (const p of payments) if (p.registration_id) paymentByReg.set(p.registration_id, p) // ordered by id: the newest wins
    const attendanceByKey = new Map(attendance.map((a) => [`${a.event_id}:${a.student_id}`, a]))
    const resultsByStudent = new Map(), resultsByTeam = new Map()
    for (const r of results) { if (r.student_id) resultsByStudent.set(`${r.event_id}:${r.student_id}`, r); if (r.team_id) resultsByTeam.set(`${r.event_id}:${r.team_id}`, r) }
    const eventById = new Map(events.map((e) => [e.id, e]))

    const regRow = (r) => {
      const team = r.team_id ? teamById.get(r.team_id) : null
      const memberIds = team ? (membersByTeam.get(team.id) || []).map((m) => m.student_id) : []
      const personId = r.student_id || team?.leader_student_id || ''
      const person = studentById.get(personId)
      const payment = paymentByReg.get(r.id)
      let attendanceLabel = '', checkIn = ''
      if (team) {
        const present = memberIds.filter((id) => attendanceByKey.get(`${r.event_id}:${id}`)?.status === 'Present').length
        attendanceLabel = memberIds.length ? `${present}/${memberIds.length} present` : ''
      } else {
        const a = attendanceByKey.get(`${r.event_id}:${r.student_id}`)
        attendanceLabel = a ? a.status : 'Not checked in'
        checkIn = a ? a.check_in_at : ''
      }
      const result = team ? resultsByTeam.get(`${r.event_id}:${team.id}`) : resultsByStudent.get(`${r.event_id}:${r.student_id}`)
      const memberNames = memberIds.map((id) => `${id} (${studentById.get(id)?.name || '?'})`).join(', ')
      return [
        text(r.id), text(personId), text(team ? `${team.team_name}${person ? ` (leader ${person.name})` : ''}` : person?.name), text(person?.department), num(person?.year), text(person?.email), text(person?.phone),
        r.registration_type, text(team ? `${team.team_name} [${team.team_code}]` : ''), memberNames, r.status,
        payment ? payment.status : (eventById.get(r.event_id)?.payment_type === 'Paid' ? 'Not started' : 'Free'),
        payment ? num(payment.amount) : '', text(payment?.method), text(payment?.receipt_no), text(r.created_at), r.source,
        attendanceLabel, checkIn, text(result?.award), num(result?.position),
      ]
    }

    const perEvent = new Map()
    for (const r of regs) { if (!perEvent.has(r.event_id)) perEvent.set(r.event_id, []); perEvent.get(r.event_id).push(r) }
    const allRows = []
    const eventRows = []
    for (const e of events) {
      const list = perEvent.get(e.id) || []
      const rows = list.map(regRow)
      add(e.event_code, tabTitle(e), REG_HEADERS, rows)
      for (const row of rows) allRows.push([row[0], e.event_code, e.name, ...row.slice(1)])
      const active = list.filter((r) => ['Confirmed', 'Payment Pending', 'Waiting for Approval'].includes(r.status)).length
      const confirmed = list.filter((r) => r.status === 'Confirmed').length
      const checkedIn = attendance.filter((a) => a.event_id === e.id && a.status === 'Present').length
      eventRows.push([e.event_code, e.name, e.category, e.organizing_department, e.event_scope, e.event_date, e.start_time, text(e.end_time), e.venue, num(e.capacity), e.registration_mode, e.payment_type, num(e.fee), e.status, active, confirmed, checkedIn, e.created_at].map((v, i) => (typeof v === 'number' ? v : text(v))))
    }
    add('Events', 'Events', EVENT_HEADERS, eventRows)
    add('All Registrations', 'All Registrations', ALL_REG_HEADERS, allRows)
    return sheets
  }

  function loadState() {
    const map = new Map()
    for (const row of db.prepare('SELECT sheet_key,row_key,row_hash FROM sheet_sync_state').all()) {
      if (!map.has(row.sheet_key)) map.set(row.sheet_key, new Map())
      map.get(row.sheet_key).set(row.row_key, row.row_hash)
    }
    return map
  }

  // Work out exactly what has to be sent to Google.
  function diff(snapshot, saved) {
    const jobs = []
    for (const sheet of snapshot.values()) {
      const known = saved.get(sheet.key) || new Map()
      const headerHash = hash([sheet.title, sheet.headers])
      const headersChanged = known.get('__headers__') !== headerHash
      const changed = []
      for (const [key, row] of sheet.rows) if (headersChanged || known.get(key) !== hash(row)) changed.push([key, row])
      const removed = [...known.keys()].filter((key) => key !== '__headers__' && !sheet.rows.has(key))
      if (changed.length || removed.length || headersChanged) jobs.push({ sheet, changed, removed, headerHash, headersChanged })
    }
    // Sheets that no longer exist in the database (deleted events): remove their rows from the state only.
    const orphaned = [...saved.keys()].filter((key) => !snapshot.has(key))
    return { jobs, orphaned }
  }

  // ---------- talking to Google ----------
  async function callScript(config, payload) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const response = await fetch(config.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...payload, secret: config.secret }), redirect: 'follow', signal: controller.signal })
      const raw = await response.text()
      let data
      try { data = JSON.parse(raw) } catch { throw new Error(`Google did not return data (HTTP ${response.status}). Deploy the script as a Web app with "Who has access: Anyone", then use the /exec URL.`) }
      if (!data.ok) throw new Error(data.error || 'The Google script rejected the request.')
      return data
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('Google took too long to answer. It will be retried automatically.')
      throw error
    } finally { clearTimeout(timer) }
  }

  // ----- Method 2: talk to the Google Sheets API directly with a service account -----
  const SHEETS_BASE = () => (allowLocal && env.EVENTHUB_SHEETS_API_BASE) || 'https://sheets.googleapis.com/v4/spreadsheets'
  const TOKEN_URL = () => (allowLocal && env.EVENTHUB_SHEETS_TOKEN_URL) || 'https://oauth2.googleapis.com/token'
  const b64url = (value) => Buffer.from(value).toString('base64url')
  const quoteTab = (name) => `'${String(name).replace(/'/g, "''")}'`
  const columnLetters = (n) => { let out = ''; for (let i = n; i > 0; i = Math.floor((i - 1) / 26)) out = String.fromCharCode(65 + ((i - 1) % 26)) + out; return out }

  async function fetchJson(url, options, what) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const response = await fetch(url, { ...options, signal: controller.signal })
      const raw = await response.text()
      let data = {}
      try { data = raw ? JSON.parse(raw) : {} } catch { /* not JSON */ }
      return { status: response.status, data }
    } catch (error) {
      if (error.name === 'AbortError') throw new Error(`Google took too long to answer (${what}). It will be retried automatically.`)
      throw new Error(`Could not reach Google (${what}): ${error.message}`)
    } finally { clearTimeout(timer) }
  }

  async function accessToken(config) {
    if (tokenCache && tokenCache.email === config.account.client_email && tokenCache.expires > Date.now() + 60_000) return tokenCache.value
    const now = Math.floor(Date.now() / 1000)
    const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({ iss: config.account.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets', aud: TOKEN_URL(), iat: now, exp: now + 3600 }))}`
    let signature
    try { signature = createSign('RSA-SHA256').update(unsigned).sign(config.account.private_key).toString('base64url') } catch { throw new Error('The private key in the service account file could not be used. Download a fresh JSON key from Google Cloud and paste it again.') }
    const { status, data } = await fetchJson(TOKEN_URL(), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }) }, 'sign-in')
    if (status !== 200 || !data.access_token) throw new Error(`Google refused the service account (${data.error_description || data.error || `HTTP ${status}`}). Check that the key is active and this computer's clock is correct.`)
    tokenCache = { email: config.account.client_email, value: data.access_token, expires: Date.now() + (Number(data.expires_in) || 3600) * 1000 }
    return tokenCache.value
  }

  async function sheetsApi(config, path, { method = 'GET', body } = {}) {
    const token = await accessToken(config)
    const { status, data } = await fetchJson(`${SHEETS_BASE()}/${config.spreadsheetId}${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }, 'Google Sheets')
    if (status >= 200 && status < 300) return data
    const message = data?.error?.message || `HTTP ${status}`
    if (status === 401) tokenCache = null
    if (status === 404) throw new Error('Google could not find that spreadsheet. Check the Sheet link.')
    if (status === 403) throw new Error(`Google says this service account cannot open the sheet (${message}). Open the Google Sheet, click Share and add ${config.account.client_email} as Editor. Also make sure the Google Sheets API is enabled for the project.`)
    if (status === 429) throw new Error('Google is limiting requests right now. It will be retried automatically in a minute.')
    throw new Error(`Google Sheets error: ${message}`)
  }

  async function callApi(config, payload) {
    if (payload.action === 'ping') {
      const meta = await sheetsApi(config, '?fields=properties.title,spreadsheetUrl')
      return { ok: true, spreadsheet: meta.properties?.title || '', url: meta.spreadsheetUrl || '' }
    }
    const meta = await sheetsApi(config, '?fields=sheets.properties(sheetId,title,gridProperties)')
    const key = payload.sheet.key
    let tab = (meta.sheets || []).map((sh) => sh.properties).find((prop) => prop.title === key || prop.title.startsWith(`${key} `))
    if (payload.action === 'delete') {
      if (!tab) return { ok: true, removed: 0 }
      const column = (await sheetsApi(config, `/values/${encodeURIComponent(`${quoteTab(tab.title)}!A:A`)}`)).values || []
      const wanted = new Set(payload.keys.map(String))
      const rows = []
      column.forEach((cells, i) => { if (i > 0 && wanted.has(String(cells?.[0] ?? ''))) rows.push(i) })
      if (rows.length) await sheetsApi(config, ':batchUpdate', { method: 'POST', body: { requests: rows.sort((x, y) => y - x).map((i) => ({ deleteDimension: { range: { sheetId: tab.sheetId, dimension: 'ROWS', startIndex: i, endIndex: i + 1 } } })) } })
      return { ok: true, removed: rows.length }
    }
    // upsert
    const headers = payload.headers, cols = headers.length
    let headerChanged = false
    if (!tab) {
      const title = String(payload.sheet.title || key).replace(/[[\]*?:/\\]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 100) || key
      const created = await sheetsApi(config, ':batchUpdate', { method: 'POST', body: { requests: [{ addSheet: { properties: { title } } }] } })
      tab = created.replies[0].addSheet.properties
      headerChanged = true
    }
    const tabRef = quoteTab(tab.title)
    const [headerRange, keyRange] = await Promise.all([
      sheetsApi(config, `/values/${encodeURIComponent(`${tabRef}!1:1`)}`),
      sheetsApi(config, `/values/${encodeURIComponent(`${tabRef}!A:A`)}`),
    ])
    const currentHeader = (headerRange.values?.[0] || []).map(String)
    if (headers.some((h, i) => currentHeader[i] !== h)) headerChanged = true
    const keyColumn = keyRange.values || []
    const index = new Map()
    keyColumn.forEach((cells, i) => { const k = String(cells?.[0] ?? ''); if (i > 0 && k !== '' && !index.has(k)) index.set(k, i + 1) })

    const data = [], appends = [], seen = new Set()
    for (const row of payload.rows) {
      const cells = row.slice(0, cols); while (cells.length < cols) cells.push('')
      const k = String(cells[0]); if (seen.has(k)) continue; seen.add(k)
      if (index.has(k)) data.push({ range: `${tabRef}!A${index.get(k)}`, majorDimension: 'ROWS', values: [cells] })
      else appends.push(cells)
    }
    const firstFree = Math.max(keyColumn.length, 1) + 1
    const needRows = firstFree - 1 + appends.length, needCols = cols
    const structure = []
    if ((tab.gridProperties?.rowCount ?? 1000) < needRows) structure.push({ appendDimension: { sheetId: tab.sheetId, dimension: 'ROWS', length: needRows - (tab.gridProperties?.rowCount ?? 1000) + 100 } })
    if ((tab.gridProperties?.columnCount ?? 26) < needCols) structure.push({ appendDimension: { sheetId: tab.sheetId, dimension: 'COLUMNS', length: needCols - (tab.gridProperties?.columnCount ?? 26) } })
    if (headerChanged) {
      structure.push({ updateSheetProperties: { properties: { sheetId: tab.sheetId, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } })
      structure.push({ repeatCell: { range: { sheetId: tab.sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: cols }, cell: { userEnteredFormat: { backgroundColor: { red: 0.07, green: 0.19, blue: 0.42 }, textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } } } }, fields: 'userEnteredFormat(backgroundColor,textFormat)' } })
      data.unshift({ range: `${tabRef}!A1`, majorDimension: 'ROWS', values: [headers] })
    }
    if (structure.length) await sheetsApi(config, ':batchUpdate', { method: 'POST', body: { requests: structure } })
    if (appends.length) data.push({ range: `${tabRef}!A${firstFree}`, majorDimension: 'ROWS', values: appends })
    if (data.length) await sheetsApi(config, '/values:batchUpdate', { method: 'POST', body: { valueInputOption: 'RAW', data } })
    return { ok: true, updated: payload.rows.length - appends.length, added: appends.length }
  }

  const callGoogle = (config, payload) => (config.mode === 'api' ? callApi(config, payload) : callScript(config, payload))

  const markSynced = db.prepare('INSERT INTO sheet_sync_state(sheet_key,row_key,row_hash,synced_at) VALUES (?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(sheet_key,row_key) DO UPDATE SET row_hash=excluded.row_hash,synced_at=CURRENT_TIMESTAMP')
  const forget = db.prepare('DELETE FROM sheet_sync_state WHERE sheet_key=? AND row_key=?')

  async function runOnce({ full = false } = {}) {
    const config = getConfig()
    if (!config || !config.enabled) return { skipped: true, reason: config ? 'Sync is switched off.' : 'Google Sheets is not connected.' }
    if (full) db.prepare('DELETE FROM sheet_sync_state').run()
    const snapshot = buildSnapshot()
    const { jobs, orphaned } = diff(snapshot, loadState())
    const result = { sheets: 0, rowsSent: 0, rowsRemoved: 0 }
    for (const key of orphaned) db.prepare('DELETE FROM sheet_sync_state WHERE sheet_key=?').run(key)
    for (const job of jobs) {
      const { sheet } = job
      const meta = { key: sheet.key, title: sheet.title }
      if (!job.changed.length && !job.removed.length) { // header-only change or empty tab: create it
        await callGoogle(config, { action: 'upsert', sheet: meta, headers: sheet.headers, textColumns: sheet.textColumns, rows: [] })
      }
      for (let i = 0; i < job.changed.length; i += BATCH_SIZE) {
        const batch = job.changed.slice(i, i + BATCH_SIZE)
        await callGoogle(config, { action: 'upsert', sheet: meta, headers: sheet.headers, textColumns: sheet.textColumns, rows: batch.map(([, row]) => row) })
        db.exec('BEGIN')
        try { for (const [key, row] of batch) markSynced.run(sheet.key, key, hash(row)); db.exec('COMMIT') } catch (error) { db.exec('ROLLBACK'); throw error }
        result.rowsSent += batch.length
      }
      for (let i = 0; i < job.removed.length; i += BATCH_SIZE) {
        const batch = job.removed.slice(i, i + BATCH_SIZE)
        await callGoogle(config, { action: 'delete', sheet: meta, keys: batch })
        for (const key of batch) forget.run(sheet.key, key)
        result.rowsRemoved += batch.length
      }
      markSynced.run(sheet.key, '__headers__', job.headerHash)
      result.sheets += 1
    }
    return result
  }

  // Run a sync now. If one is already running this waits for it, then runs again so the
  // caller always gets an up-to-date result. Never throws: failures are recorded and retried.
  async function sync({ full = false } = {}) {
    while (state.running) await state.promise
    state.running = true; state.dirty = false
    clearTimeout(state.timer); state.timer = null
    state.promise = (async () => {
      state.lastRunAt = new Date().toISOString()
      try {
        const result = await runOnce({ full })
        state.lastResult = result
        if (!result.skipped) { state.lastSuccessAt = new Date().toISOString(); state.lastError = null; state.failures = 0 }
        return { ok: true, ...result }
      } catch (error) {
        state.failures += 1
        state.lastError = error.message
        log.error(`[sheets] sync failed: ${error.message}`)
        const wait = Math.min(15 * 60_000, 30_000 * 2 ** Math.min(state.failures - 1, 5))
        clearTimeout(state.retryTimer); state.retryTimer = setTimeout(() => schedule(0), wait)
        return { ok: false, error: error.message }
      } finally {
        state.running = false
        if (state.dirty) schedule(DEBOUNCE_MS)
      }
    })()
    return state.promise
  }

  // Called after every successful change; several changes within a few seconds become one sync.
  function schedule(delay = DEBOUNCE_MS) {
    if (!isActive()) return
    if (state.running) { state.dirty = true; return }
    clearTimeout(state.timer)
    state.timer = setTimeout(() => { state.timer = null; void sync() }, delay)
  }

  function start() {
    const interval = setInterval(() => { if (isActive() && !state.running) void sync() }, SAFETY_INTERVAL_MS)
    interval.unref?.()
    if (isActive()) schedule(2000)
  }

  async function test() {
    const config = getConfig()
    if (!config) return { ok: false, error: 'Save the connection details first.' }
    try {
      const data = await callGoogle(config, { action: 'ping' })
      return { ok: true, spreadsheet: data.spreadsheet || '', spreadsheetUrl: data.url || '' }
    } catch (error) { return { ok: false, error: error.message } }
  }

  function status() {
    const config = getConfig()
    let pending = null, perSheet = []
    if (config) {
      try {
        const snapshot = buildSnapshot()
        const { jobs } = diff(snapshot, loadState())
        pending = jobs.reduce((sum, j) => sum + j.changed.length + j.removed.length, 0)
        const saved = loadState()
        perSheet = [...snapshot.values()].map((s) => ({ key: s.key, title: s.title, rows: s.rows.size, synced: [...(saved.get(s.key)?.keys() || [])].filter((k) => k !== '__headers__' && s.rows.has(k)).length }))
      } catch (error) { log.error(`[sheets] status failed: ${error.message}`) }
    }
    let host = ''
    if (config?.mode === 'script') { try { host = new URL(config.url).host } catch { /* ignore */ } }
    return {
      connected: Boolean(config), enabled: Boolean(config?.enabled), source: config?.source || null, mode: config?.mode || null, host,
      urlTail: config?.mode === 'script' ? `…${config.url.slice(-14)}` : '',
      serviceEmail: config?.mode === 'api' ? config.account.client_email : '', spreadsheetTail: config?.mode === 'api' ? `…${config.spreadsheetId.slice(-8)}` : '', running: state.running, pending,
      lastRunAt: state.lastRunAt, lastSuccessAt: state.lastSuccessAt, lastError: state.lastError, lastResult: state.lastResult, sheets: perSheet,
    }
  }

  return { getConfig, saveConfig, clearConfig, schedule, sync, start, test, status, buildSnapshot }
}
