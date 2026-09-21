import http from 'node:http'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { randomBytes, scryptSync, timingSafeEqual, createHash, createHmac } from 'node:crypto'
import { createPublicFeatures } from './public-features.mjs'
import { serveWeb } from './static-web.mjs'
import { createSheetsSync } from './sheets-sync.mjs'
import { readFileSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
// Tests and staging use their own directory; the default production path is unchanged.
const dataDir = process.env.EVENTHUB_DATA_DIR || join(root, 'data')
mkdirSync(dataDir, { recursive: true })

const db = new DatabaseSync(join(dataDir, 'eventhub.sqlite'))
db.exec('PRAGMA journal_mode = WAL;')
db.exec('PRAGMA foreign_keys = ON;')
db.exec(`
  CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    department TEXT NOT NULL,
    year INTEGER NOT NULL CHECK (year BETWEEN 1 AND 3),
    semester INTEGER CHECK (semester BETWEEN 1 AND 6),
    batch TEXT,
    roll_no TEXT,
    barcode_value TEXT UNIQUE,
    email TEXT,
    phone TEXT,
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Inactive','Passed Out')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_students_department ON students(department);
  CREATE INDEX IF NOT EXISTS idx_students_year ON students(year);
  CREATE INDEX IF NOT EXISTS idx_students_name ON students(name);

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    college_id TEXT UNIQUE,
    role TEXT NOT NULL CHECK (role IN ('Super Admin','HOD','Main Coordinator','Department Coordinator','Librarian','Student')),
    department TEXT,
    student_id TEXT UNIQUE,
    password_hash TEXT,
    password_salt TEXT,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(student_id) ON UPDATE CASCADE ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
  CREATE INDEX IF NOT EXISTS idx_users_department ON users(department);

  CREATE TABLE IF NOT EXISTS auth_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON auth_sessions(user_id);

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL,
    organizing_department TEXT NOT NULL,
    event_scope TEXT NOT NULL DEFAULT 'Department' CHECK (event_scope IN ('College','Department','Library')),
    event_date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT,
    venue TEXT NOT NULL,
    capacity INTEGER,
    registration_open TEXT,
    registration_deadline TEXT,
    registration_mode TEXT NOT NULL DEFAULT 'Individual' CHECK (registration_mode IN ('Individual','Team')),
    team_min INTEGER,
    team_max INTEGER,
    payment_type TEXT NOT NULL DEFAULT 'Free' CHECK (payment_type IN ('Free','Paid')),
    fee REAL NOT NULL DEFAULT 0,
    online_payment INTEGER NOT NULL DEFAULT 0 CHECK (online_payment IN (0,1)),
    offline_payment INTEGER NOT NULL DEFAULT 0 CHECK (offline_payment IN (0,1)),
    eligible_departments TEXT,
    eligible_years TEXT,
    eligible_semesters TEXT,
    rules TEXT,
    prizes TEXT,
    status TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Submitted','Approved','Changes Requested','Rejected','Published','Registration Open','Registration Closed','Ongoing','Completed','Results Published','Certificates Issued','Archived')),
    approval_comment TEXT,
    created_by INTEGER NOT NULL,
    main_coordinator_id INTEGER,
    submitted_at TEXT,
    approved_at TEXT,
    approved_by INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (main_coordinator_id) REFERENCES users(id),
    FOREIGN KEY (approved_by) REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
  CREATE INDEX IF NOT EXISTS idx_events_department ON events(organizing_department);
  CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date);

  CREATE TABLE IF NOT EXISTS event_department_coordinators (
    event_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    department TEXT NOT NULL,
    PRIMARY KEY (event_id, user_id),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS event_approval_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    comment TEXT,
    acted_by INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY (acted_by) REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS idx_approval_event ON event_approval_history(event_id);
`)


// V3.2 team/competition extensions. These additive migrations preserve V3.1 databases.
function hasColumn(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column)
}
function addColumn(table, definition) {
  const column = definition.trim().split(/\s+/)[0]
  if (!hasColumn(table, column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`)
}
addColumn('students', "photo_url TEXT")
addColumn('events', "poster_url TEXT")
addColumn('events', "participation_type TEXT NOT NULL DEFAULT 'Individual' CHECK (participation_type IN ('Individual','Team','Both'))")
addColumn('events', "allow_student_teams INTEGER NOT NULL DEFAULT 1 CHECK (allow_student_teams IN (0,1))")
addColumn('events', "allow_coordinator_teams INTEGER NOT NULL DEFAULT 1 CHECK (allow_coordinator_teams IN (0,1))")
addColumn('events', "team_name_required INTEGER NOT NULL DEFAULT 1 CHECK (team_name_required IN (0,1))")
addColumn('events', "member_approval_required INTEGER NOT NULL DEFAULT 1 CHECK (member_approval_required IN (0,1))")
addColumn('events', "coordinator_team_approval_required INTEGER NOT NULL DEFAULT 1 CHECK (coordinator_team_approval_required IN (0,1))")
addColumn('events', "allow_member_replacement INTEGER NOT NULL DEFAULT 1 CHECK (allow_member_replacement IN (0,1))")
addColumn('events', "one_team_per_student INTEGER NOT NULL DEFAULT 1 CHECK (one_team_per_student IN (0,1))")
addColumn('events', "team_fee_mode TEXT NOT NULL DEFAULT 'Per Student' CHECK (team_fee_mode IN ('Per Student','Per Team'))")
addColumn('events', "scope_label TEXT")
addColumn('events', "registration_approval_required INTEGER NOT NULL DEFAULT 1 CHECK (registration_approval_required IN (0,1))")
addColumn('events', "requirements TEXT")
addColumn('events', "contact_info TEXT")


db.exec(`
  CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    team_name TEXT NOT NULL,
    team_code TEXT NOT NULL UNIQUE,
    leader_student_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Pending','Approved','Changes Requested','Rejected','Locked')),
    review_comment TEXT,
    created_by_user_id INTEGER NOT NULL,
    approved_by INTEGER,
    approved_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY (leader_student_id) REFERENCES students(student_id),
    FOREIGN KEY (created_by_user_id) REFERENCES users(id),
    FOREIGN KEY (approved_by) REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS idx_teams_event ON teams(event_id);
  CREATE INDEX IF NOT EXISTS idx_teams_status ON teams(status);
  CREATE INDEX IF NOT EXISTS idx_teams_leader ON teams(leader_student_id);

  CREATE TABLE IF NOT EXISTS team_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER NOT NULL,
    student_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'Member' CHECK (role IN ('Leader','Member')),
    status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Accepted','Verified','Declined')),
    joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (team_id, student_id),
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES students(student_id) ON UPDATE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_team_members_student ON team_members(student_id);

  CREATE TABLE IF NOT EXISTS team_audit_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    details TEXT,
    acted_by INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
    FOREIGN KEY (acted_by) REFERENCES users(id)
  );
`)



// V3.4 registration + waiting-list foundation.
db.exec(`
  CREATE TABLE IF NOT EXISTS registrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    registration_type TEXT NOT NULL CHECK (registration_type IN ('Individual','Team')),
    student_id TEXT,
    team_id INTEGER,
    status TEXT NOT NULL DEFAULT 'Confirmed' CHECK (status IN ('Confirmed','Payment Pending','Waiting for Approval','Waiting List','Rejected','Cancelled')),
    source TEXT NOT NULL DEFAULT 'Self' CHECK (source IN ('Self','Coordinator')),
    created_by_user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES students(student_id) ON UPDATE CASCADE,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id),
    CHECK ((registration_type='Individual' AND student_id IS NOT NULL AND team_id IS NULL) OR (registration_type='Team' AND team_id IS NOT NULL AND student_id IS NULL))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS uq_registration_student_event ON registrations(event_id, student_id) WHERE student_id IS NOT NULL AND status != 'Cancelled';
  CREATE UNIQUE INDEX IF NOT EXISTS uq_registration_team_event ON registrations(event_id, team_id) WHERE team_id IS NOT NULL AND status != 'Cancelled';
  CREATE INDEX IF NOT EXISTS idx_registrations_event ON registrations(event_id);
  CREATE INDEX IF NOT EXISTS idx_registrations_status ON registrations(status);

  CREATE TABLE IF NOT EXISTS waiting_list (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    registration_id INTEGER NOT NULL UNIQUE,
    position INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY (registration_id) REFERENCES registrations(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_waiting_event_position ON waiting_list(event_id, position);
` )

// Upgrade older V3 registration tables safely without deleting EventHub data.
function migrateRegistrationStatusConstraint() {
  const schema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='registrations'").get()?.sql || ''
  if (schema.includes("'Waiting for Approval'") && schema.includes("'Rejected'")) return
  db.exec('PRAGMA foreign_keys = OFF;')
  try {
    db.exec('BEGIN')
    db.exec(`
      CREATE TABLE registrations_upgrade (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id INTEGER NOT NULL,
        registration_type TEXT NOT NULL CHECK (registration_type IN ('Individual','Team')),
        student_id TEXT,
        team_id INTEGER,
        status TEXT NOT NULL DEFAULT 'Confirmed' CHECK (status IN ('Confirmed','Payment Pending','Waiting for Approval','Waiting List','Rejected','Cancelled')),
        source TEXT NOT NULL DEFAULT 'Self' CHECK (source IN ('Self','Coordinator')),
        created_by_user_id INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
        FOREIGN KEY (student_id) REFERENCES students(student_id) ON UPDATE CASCADE,
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by_user_id) REFERENCES users(id),
        CHECK ((registration_type='Individual' AND student_id IS NOT NULL AND team_id IS NULL) OR (registration_type='Team' AND team_id IS NOT NULL AND student_id IS NULL))
      );
      INSERT INTO registrations_upgrade(id,event_id,registration_type,student_id,team_id,status,source,created_by_user_id,created_at,updated_at)
      SELECT id,event_id,registration_type,student_id,team_id,
        CASE WHEN status='Confirmed' THEN 'Confirmed' WHEN status='Payment Pending' THEN 'Payment Pending' WHEN status='Waiting List' THEN 'Waiting List' WHEN status='Cancelled' THEN 'Cancelled' ELSE 'Confirmed' END,
        source,created_by_user_id,created_at,updated_at FROM registrations;
      DROP TABLE registrations;
      ALTER TABLE registrations_upgrade RENAME TO registrations;
      CREATE UNIQUE INDEX uq_registration_student_event ON registrations(event_id, student_id) WHERE student_id IS NOT NULL AND status != 'Cancelled';
      CREATE UNIQUE INDEX uq_registration_team_event ON registrations(event_id, team_id) WHERE team_id IS NOT NULL AND status != 'Cancelled';
      CREATE INDEX idx_registrations_event ON registrations(event_id);
      CREATE INDEX idx_registrations_status ON registrations(status);
    `)
    db.exec('COMMIT')
  } catch (error) {
    try { db.exec('ROLLBACK') } catch {}
    throw error
  } finally {
    db.exec('PRAGMA foreign_keys = ON;')
  }
}
migrateRegistrationStatusConstraint()

const PORT = Number(process.env.EVENTHUB_API_PORT ?? process.env.PORT ?? 8787)
const allowedDepartments = ['CSE', 'Civil', 'Mechanical', 'Electrical', 'EEE']
const allowedRoles = ['Super Admin', 'HOD', 'Main Coordinator', 'Department Coordinator', 'Librarian', 'Student']
const SESSION_HOURS = 12
// Which website address may call this API from a browser. '*' = any (fine when the site is served by this same server).
// When the website is on GitHub Pages set EVENTHUB_CORS_ORIGIN=https://YOURNAME.github.io (no path, no trailing slash).
const CORS_ORIGIN = (process.env.EVENTHUB_CORS_ORIGIN || '*').trim().replace(/\/+$/, '') || '*'

function json(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': CORS_ORIGIN,
    ...(CORS_ORIGIN === '*' ? {} : { Vary: 'Origin' }),
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Cache-Control': 'no-store',
  })
  res.end(body)
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
      if (raw.length > 10_000_000) {
        reject(new Error('Request too large'))
        req.destroy()
      }
    })
    req.on('end', () => {
      if (!raw) return resolve({})
      try { resolve(JSON.parse(raw)) } catch { reject(new Error('Invalid JSON body')) }
    })
    req.on('error', reject)
  })
}

function clean(value) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(password, salt, 64).toString('hex')
  return { hash, salt }
}

function verifyPassword(password, hash, salt) {
  if (!password || !hash || !salt) return false
  const actual = scryptSync(password, salt, 64)
  const expected = Buffer.from(hash, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex')
}

function publicUser(row) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    college_id: row.college_id,
    role: row.role,
    department: row.department,
    student_id: row.student_id,
    active: Boolean(row.active),
  }
}

function createSession(userId) {
  const token = randomBytes(32).toString('base64url')
  const expires = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000).toISOString()
  db.prepare('INSERT INTO auth_sessions (user_id, token_hash, expires_at) VALUES (?,?,?)')
    .run(userId, tokenHash(token), expires)
  return { token, expires_at: expires }
}

function getAuth(req) {
  const header = clean(req.headers.authorization)
  if (!header.toLowerCase().startsWith('bearer ')) return null
  const token = header.slice(7).trim()
  if (!token) return null
  const row = db.prepare(`
    SELECT u.*, s.expires_at, s.id AS session_id
    FROM auth_sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND datetime(s.expires_at) > datetime('now') AND u.active = 1
  `).get(tokenHash(token))
  return row ? { user: row, token, session_id: row.session_id } : null
}

function requireAuth(req, res, roles = []) {
  const auth = getAuth(req)
  if (!auth) {
    json(res, 401, { ok: false, error: 'Please sign in to continue.' })
    return null
  }
  const libraryCoordinator = auth.user.role === 'Librarian' && roles.includes('Main Coordinator')
  if (roles.length && !roles.includes(auth.user.role) && !libraryCoordinator) {
    json(res, 403, { ok: false, error: 'You do not have permission to perform this action.' })
    return null
  }
  return auth
}

function normalizeStudent(input) {
  return {
    student_id: clean(input.student_id || input.studentId || input['Student ID']),
    name: clean(input.name || input.Name),
    department: clean(input.department || input.Department),
    year: Number(input.year || input.Year),
    semester: clean(input.semester || input.Semester) ? Number(input.semester || input.Semester) : null,
    batch: clean(input.batch || input.Batch) || null,
    roll_no: clean(input.roll_no || input.rollNo || input['Roll No'] || input['Roll Number']) || null,
    barcode_value: clean(input.barcode_value || input.barcodeValue || input['Barcode Value']) || null,
    email: clean(input.email || input.Email) || null,
    phone: clean(input.phone || input.Phone) || null,
    status: clean(input.status || input.Status) || 'Active',
  }
}

function validateStudent(s) {
  const errors = []
  if (!s.student_id) errors.push('Student ID is required')
  if (!s.name) errors.push('Name is required')
  if (!allowedDepartments.includes(s.department)) errors.push(`Department must be one of: ${allowedDepartments.join(', ')}`)
  if (![1, 2, 3].includes(s.year)) errors.push('Year must be 1, 2 or 3')
  if (s.semester !== null && ![1, 2, 3, 4, 5, 6].includes(s.semester)) errors.push('Semester must be between 1 and 6')
  if (!['Active', 'Inactive', 'Passed Out'].includes(s.status)) errors.push('Invalid status')
  return errors
}

function getStudentById(studentId) {
  return db.prepare('SELECT * FROM students WHERE student_id = ?').get(studentId)
}

const allowedEventCategories = ['College Event','Department Event','Library Event','Sports Event','Cultural Event','Technical Event','Workshop & Seminar','Competition','Hackathon','Training Program','Guest Lecture','Industrial Visit']

function eventCode() {
  const year = new Date().getFullYear()
  const prefix = `EH-${year}-`

  const row = db.prepare(`
    SELECT event_code
    FROM events
    WHERE event_code LIKE ?
    ORDER BY CAST(SUBSTR(event_code, ?) AS INTEGER) DESC
    LIMIT 1
  `).get(`${prefix}%`, prefix.length + 1)

  let nextNumber = 1

  if (row?.event_code) {
    const currentNumber = Number(
      String(row.event_code).slice(prefix.length)
    )

    if (Number.isInteger(currentNumber) && currentNumber >= 1) {
      nextNumber = currentNumber + 1
    }
  }

  return `${prefix}${String(nextNumber).padStart(4, '0')}`
}

function jsonList(value) {
  if (Array.isArray(value)) return JSON.stringify(value.map(clean).filter(Boolean))
  if (!value) return '[]'
  try {
    const parsed = JSON.parse(String(value))
    return JSON.stringify(Array.isArray(parsed) ? parsed : [])
  } catch { return '[]' }
}

function parseEventRow(row) {
  if (!row) return null
  const parse = (value) => { try { return JSON.parse(value || '[]') } catch { return [] } }
  return {
    ...row,
    online_payment: Boolean(row.online_payment),
    offline_payment: Boolean(row.offline_payment),
    allow_student_teams: Boolean(row.allow_student_teams),
    allow_coordinator_teams: Boolean(row.allow_coordinator_teams),
    team_name_required: Boolean(row.team_name_required),
    member_approval_required: Boolean(row.member_approval_required),
    coordinator_team_approval_required: Boolean(row.coordinator_team_approval_required),
    allow_member_replacement: Boolean(row.allow_member_replacement),
    one_team_per_student: Boolean(row.one_team_per_student),
    registration_approval_required: Boolean(row.registration_approval_required),
    participation_type: row.participation_type || row.registration_mode || 'Individual',
    event_scope: row.scope_label || row.event_scope || 'Department',
    eligible_departments: parse(row.eligible_departments),
    eligible_years: parse(row.eligible_years),
    eligible_semesters: parse(row.eligible_semesters),
  }
}

function normalizeEvent(input, authUser, current = {}) {
  const paymentType = clean(input.payment_type ?? current.payment_type) || 'Free'
  const participationType = clean(input.participation_type ?? current.participation_type ?? input.registration_mode ?? current.registration_mode) || 'Individual'
  const mode = participationType === 'Individual' ? 'Individual' : 'Team'
  const requestedScope = clean(input.event_scope ?? current.scope_label ?? current.event_scope) || 'Department'
  const storedScope = ['Department','College','Library'].includes(requestedScope) ? requestedScope : (requestedScope === 'Library' ? 'Library' : 'College')
  return {
    name: clean(input.name ?? current.name),
    description: clean(input.description ?? current.description) || null,
    category: clean(input.category ?? current.category),
    organizing_department: clean(input.organizing_department ?? current.organizing_department) || authUser.department || 'Administration',
    event_scope: storedScope,
    scope_label: requestedScope,
    event_date: clean(input.event_date ?? current.event_date),
    start_time: clean(input.start_time ?? current.start_time),
    end_time: clean(input.end_time ?? current.end_time) || null,
    venue: clean(input.venue ?? current.venue),
    capacity: clean(input.capacity ?? current.capacity) ? Number(input.capacity ?? current.capacity) : null,
    registration_open: clean(input.registration_open ?? current.registration_open) || null,
    registration_deadline: clean(input.registration_deadline ?? current.registration_deadline) || null,
    registration_mode: mode,
    participation_type: participationType,
    team_min: participationType !== 'Individual' && clean(input.team_min ?? current.team_min) ? Number(input.team_min ?? current.team_min) : null,
    team_max: participationType !== 'Individual' && clean(input.team_max ?? current.team_max) ? Number(input.team_max ?? current.team_max) : null,
    allow_student_teams: participationType !== 'Individual' ? Boolean(input.allow_student_teams ?? current.allow_student_teams ?? true) : false,
    allow_coordinator_teams: participationType !== 'Individual' ? Boolean(input.allow_coordinator_teams ?? current.allow_coordinator_teams ?? true) : false,
    team_name_required: participationType !== 'Individual' ? Boolean(input.team_name_required ?? current.team_name_required ?? true) : false,
    member_approval_required: participationType !== 'Individual' ? Boolean(input.member_approval_required ?? current.member_approval_required ?? true) : false,
    coordinator_team_approval_required: participationType !== 'Individual' ? Boolean(input.coordinator_team_approval_required ?? current.coordinator_team_approval_required ?? true) : false,
    allow_member_replacement: participationType !== 'Individual' ? Boolean(input.allow_member_replacement ?? current.allow_member_replacement ?? true) : false,
    one_team_per_student: participationType !== 'Individual' ? Boolean(input.one_team_per_student ?? current.one_team_per_student ?? true) : false,
    team_fee_mode: participationType !== 'Individual' ? (clean(input.team_fee_mode ?? current.team_fee_mode) || 'Per Student') : 'Per Student',
    payment_type: paymentType,
    fee: paymentType === 'Paid' ? Number(input.fee ?? current.fee ?? 0) : 0,
    online_payment: paymentType === 'Paid' ? Boolean(input.online_payment ?? current.online_payment) : false,
    offline_payment: paymentType === 'Paid' ? Boolean(input.offline_payment ?? current.offline_payment) : false,
    eligible_departments: jsonList(input.eligible_departments ?? current.eligible_departments),
    eligible_years: jsonList(input.eligible_years ?? current.eligible_years),
    eligible_semesters: jsonList(input.eligible_semesters ?? current.eligible_semesters),
    rules: clean(input.rules ?? current.rules) || null,
    prizes: clean(input.prizes ?? current.prizes) || null,
    requirements: clean(input.requirements ?? current.requirements) || null,
    contact_info: clean(input.contact_info ?? current.contact_info) || null,
    registration_approval_required: Boolean(input.registration_approval_required ?? current.registration_approval_required ?? true),
    main_coordinator_id: Number(input.main_coordinator_id ?? current.main_coordinator_id ?? authUser.id),
  }
}

function validateEvent(event, authUser) {
  const errors = []
  if (!event.name) errors.push('Event name is required.')
  if (!event.category || event.category.length > 120) errors.push('Enter a valid event category.')
  if (!event.scope_label || event.scope_label.length > 120) errors.push('Enter a valid event scope.')
  if (!event.event_date) errors.push('Event date is required.')
  if (!event.start_time) errors.push('Start time is required.')
  if (!event.venue) errors.push('Venue is required.')
  if (event.event_date && (!/^\d{4}-\d{2}-\d{2}$/.test(event.event_date) || Number.isNaN(Date.parse(`${event.event_date}T00:00:00Z`)) || new Date(`${event.event_date}T00:00:00Z`).toISOString().slice(0,10) !== event.event_date)) errors.push('Enter a valid event date.')
  if (event.start_time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(event.start_time)) errors.push('Enter a valid start time.')
  if (event.end_time && (!/^([01]\d|2[0-3]):[0-5]\d$/.test(event.end_time) || event.end_time <= event.start_time)) errors.push('End time must be later than start time.')
  if (event.registration_open && Number.isNaN(Date.parse(event.registration_open))) errors.push('Enter a valid registration opening date.')
  if (event.registration_deadline && Number.isNaN(Date.parse(event.registration_deadline))) errors.push('Enter a valid registration deadline.')
  if (event.registration_open && event.registration_deadline && Date.parse(event.registration_deadline) < Date.parse(event.registration_open)) errors.push('Registration deadline must follow the opening date.')
  if (event.capacity !== null && (!Number.isInteger(event.capacity) || event.capacity < 1)) errors.push('Capacity must be at least 1.')
  if (!['Individual','Team','Both'].includes(event.participation_type)) errors.push('Choose Individual, Team or Both participation.')
  if (event.participation_type !== 'Individual') {
    if (!event.team_min || !event.team_max || event.team_min < 2 || event.team_max < event.team_min) errors.push('Enter a valid team size range.')
    if (!event.allow_student_teams && !event.allow_coordinator_teams) errors.push('Enable student-created or coordinator-created teams.')
    if (!['Per Student','Per Team'].includes(event.team_fee_mode)) errors.push('Choose a valid team payment mode.')
  }
  if (event.payment_type === 'Paid') {
    if (!(event.fee > 0)) errors.push('Enter a valid event fee.')
    if (!event.online_payment && !event.offline_payment) errors.push('Enable online or offline payment for a paid event.')
  }
  if (authUser.role === 'Department Coordinator' && event.organizing_department !== authUser.department) errors.push('You can only create events for your department.')
  if (authUser.role === 'Librarian' && (event.event_scope !== 'Library' || event.organizing_department !== authUser.department)) errors.push('Librarians can manage Library-scope events for their own department.')
  return errors
}


function syncEventDepartmentCoordinators(eventId, coordinatorIds, event) {
  if (!Array.isArray(coordinatorIds)) return

  db.prepare(
    'DELETE FROM event_department_coordinators WHERE event_id=?'
  ).run(eventId)

  const uniqueIds = [...new Set(
    coordinatorIds
      .map(Number)
      .filter(Number.isInteger)
  )]

  for (const userId of uniqueIds) {
    const coordinator = db.prepare(`
      SELECT id,name,role,department
      FROM users
      WHERE id=?
        AND active=1
        AND role='Department Coordinator'
    `).get(userId)

    if (!coordinator) continue

    /*
     * Department event:
     * coordinator must belong to organizing department.
     */
    if (
      event.event_scope === 'Department' &&
      coordinator.department !== event.organizing_department
    ) {
      continue
    }

    db.prepare(`
      INSERT OR IGNORE INTO event_department_coordinators(
        event_id,
        user_id,
        department
      )
      VALUES (?,?,?)
    `).run(
      eventId,
      coordinator.id,
      coordinator.department
    )
  }
}

function isAssignedEventCoordinator(userId,eventId) {
  if(!userId || !eventId) return false

  return Boolean(
    db.prepare(`
      SELECT 1
      FROM event_department_coordinators
      WHERE event_id=?
        AND user_id=?
      LIMIT 1
    `).get(eventId,userId)
  )
}

function canManageEvent(user, event) {
  if (user.role === 'Librarian') return event.event_scope === 'Library' && (event.created_by === user.id || event.main_coordinator_id === user.id)
  if (user.role === 'Super Admin') return true
  if (user.role === 'Main Coordinator') return event.created_by === user.id || event.main_coordinator_id === user.id
  if (user.role === 'Department Coordinator') {
    return (
      event.organizing_department === user.department ||
      isAssignedEventCoordinator(
        user.id,
        event.id
      )
    )
  }
  return false
}


function teamCode() {
  for (let i = 0; i < 20; i += 1) {
    const code = `TEAM-${randomBytes(3).toString('hex').toUpperCase()}`
    if (!db.prepare('SELECT id FROM teams WHERE team_code=?').get(code)) return code
  }
  return `TEAM-${Date.now().toString(36).toUpperCase()}`
}

function parseList(value) {
  try { const v = JSON.parse(value || '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
}

function eventSupportsTeams(event) {
  const type = event.participation_type || event.registration_mode
  return type === 'Team' || type === 'Both'
}

function validateStudentForEvent(student, event) {
  const errors = []
  if (!student || student.status !== 'Active') return ['Student is not active in the Student Directory.']
  const deps = parseList(event.eligible_departments)
  const years = parseList(event.eligible_years).map(String)
  const sems = parseList(event.eligible_semesters).map(String)
  if (deps.length && !deps.includes(student.department)) errors.push(`${student.name} is not in an eligible department.`)
  if (years.length && !years.includes(String(student.year))) errors.push(`${student.name} is not in an eligible year.`)
  if (sems.length && student.semester && !sems.includes(String(student.semester))) errors.push(`${student.name} is not in an eligible semester.`)
  return errors
}

function canCoordinateEvent(user, event) {
  if (user.role === 'Librarian') return canManageEvent(user, event)
  if (user.role === 'Super Admin') return true
  if (user.role === 'Main Coordinator') return event.created_by === user.id || event.main_coordinator_id === user.id
  if (user.role === 'Department Coordinator') {
    return (
      event.organizing_department === user.department ||
      isAssignedEventCoordinator(
        user.id,
        event.id
      )
    )
  }

  return false
}

function canReadEvent(user, event) {
  return canCoordinateEvent(user, event) || (user.role === 'HOD' && event.organizing_department === user.department)
}

function canCoordinateTeamEvent(user, event) {
  if (!user || !event) return false
  if (user.role === 'Librarian') return canCoordinateEvent(user, event)

  if (user.role === 'Super Admin') return true

  const collegeWide =
    event.event_scope === 'College' ||
    event.organizing_department === 'Administration' ||
    event.category === 'College Event'

  // College-wide event:
  // every Main Coordinator and Department Coordinator may form teams.
  if (
    collegeWide &&
    ['Main Coordinator', 'Department Coordinator'].includes(user.role)
  ) {
    return true
  }

  // Department event:
  // department coordinator must belong to that department.
  if (user.role === 'Department Coordinator') {
    return event.organizing_department === user.department
  }

  // Main Coordinator keeps normal event-management permission.
  if (user.role === 'Main Coordinator') {
    return (
      event.created_by === user.id ||
      event.main_coordinator_id === user.id
    )
  }

  return false
}

function hasActiveIndividualRegistration(eventId, studentId) {
  return Boolean(
    db.prepare(`
      SELECT id
      FROM registrations
      WHERE event_id=?
        AND student_id=?
        AND registration_type='Individual'
        AND status NOT IN ('Cancelled','Rejected')
      LIMIT 1
    `).get(eventId, studentId)
  )
}

function getTeam(id) {
  return db.prepare(`SELECT t.*, e.name AS event_name,e.event_code,e.organizing_department,e.participation_type,e.registration_mode,e.team_min,e.team_max,e.team_name_required,e.member_approval_required,e.coordinator_team_approval_required,e.allow_member_replacement,e.one_team_per_student,e.status AS event_status,e.registration_deadline,e.payment_type,e.fee,e.team_fee_mode,
    s.name AS leader_name,s.department AS leader_department,s.year AS leader_year
    FROM teams t JOIN events e ON e.id=t.event_id JOIN students s ON s.student_id=t.leader_student_id WHERE t.id=?`).get(id)
}

function teamMembers(teamId) {
  return db.prepare(`SELECT tm.student_id,tm.role,tm.status,tm.joined_at,s.name,s.department,s.year,s.semester,s.roll_no
    FROM team_members tm JOIN students s ON s.student_id=tm.student_id WHERE tm.team_id=?
    ORDER BY CASE tm.role WHEN 'Leader' THEN 0 ELSE 1 END,s.name COLLATE NOCASE`).all(teamId)
}

function teamPayload(team) {
  if (!team) return null
  return { ...team, members: teamMembers(team.id) }
}

function studentAlreadyInEventTeam(eventId, studentId, ignoreTeamId = null) {
  const row = db.prepare(`SELECT t.id,t.team_name,t.status FROM team_members tm JOIN teams t ON t.id=tm.team_id
    WHERE t.event_id=? AND tm.student_id=? AND tm.status!='Declined' AND t.status!='Rejected' ${ignoreTeamId ? 'AND t.id!=?' : ''} LIMIT 1`)
    .get(...(ignoreTeamId ? [eventId, studentId, ignoreTeamId] : [eventId, studentId]))
  return row || null
}



function registrationWindowOpen(event) {
  if (!['Published','Registration Open'].includes(event.status)) return false
  const now = Date.now()
  if (event.registration_open) {
    const open = new Date(event.registration_open).getTime()
    if (!Number.isNaN(open) && now < open) return false
  }
  if (event.registration_deadline) {
    const deadline = new Date(event.registration_deadline).getTime()
    if (!Number.isNaN(deadline) && now > deadline) return false
  }
  return true
}

function registrationSeatCount(eventId) {
  const individual = Number(db.prepare("SELECT COUNT(*) AS count FROM registrations WHERE event_id=? AND registration_type='Individual' AND status IN ('Confirmed','Payment Pending','Waiting for Approval')").get(eventId).count)
  const teamRows = db.prepare("SELECT r.team_id FROM registrations r WHERE r.event_id=? AND r.registration_type='Team' AND r.status IN ('Confirmed','Payment Pending','Waiting for Approval')").all(eventId)
  let teamMembers = 0
  for (const row of teamRows) teamMembers += Number(db.prepare("SELECT COUNT(*) AS count FROM team_members WHERE team_id=? AND status!='Declined'").get(row.team_id).count)
  return individual + teamMembers
}

function registrationCapacityNeeded(type, teamId) {
  if (type === 'Individual') return 1
  return Number(db.prepare("SELECT COUNT(*) AS count FROM team_members WHERE team_id=? AND status!='Declined'").get(teamId).count)
}

function nextWaitingPosition(eventId) {
  return Number(db.prepare('SELECT COALESCE(MAX(position),0)+1 AS pos FROM waiting_list WHERE event_id=?').get(eventId).pos)
}

function registrationStatusFor(event, seatsNeeded) {
  const used = registrationSeatCount(event.id)
  if (event.capacity && used + seatsNeeded > Number(event.capacity)) return 'Waiting List'
  return event.payment_type === 'Paid' ? 'Payment Pending' : 'Confirmed'
}

function registrationPayload(row) {
  if (!row) return null
  const event = parseEventRow(db.prepare('SELECT * FROM events WHERE id=?').get(row.event_id))
  const waiting = row.status === 'Waiting List' ? db.prepare('SELECT position FROM waiting_list WHERE registration_id=?').get(row.id) : null
  let subject = null
  if (row.registration_type === 'Individual') subject = getStudentById(row.student_id)
  else subject = teamPayload(getTeam(row.team_id))
  const payment=db.prepare('SELECT * FROM payments WHERE registration_id=? ORDER BY id DESC LIMIT 1').get(row.id)||null
  return {...row,event,subject,payment,waiting_position:waiting?.position||null}
}

function registrationPaymentAmount(event, registration) {
  if (event.payment_type !== 'Paid') return 0
  if (registration.registration_type === 'Team' && event.team_fee_mode === 'Per Student') {
    return Number(event.fee || 0) * Math.max(1, registrationCapacityNeeded('Team', registration.team_id))
  }
  return Number(event.fee || 0)
}

function ensurePaymentForRegistration(registrationId) {
  const registration = db.prepare('SELECT * FROM registrations WHERE id=?').get(registrationId)
  if (!registration) return null
  const event = db.prepare('SELECT * FROM events WHERE id=?').get(registration.event_id)
  if (!event || event.payment_type !== 'Paid' || registration.status === 'Waiting List') return null
  let payment = db.prepare("SELECT * FROM payments WHERE registration_id=? AND status IN ('Pending','Paid') ORDER BY id DESC LIMIT 1").get(registrationId)
  if (payment) return payment
  const amount = registrationPaymentAmount(event, registration)
  const result = db.prepare(`INSERT INTO payments(event_id,registration_id,student_id,team_id,amount,method,status,notes)
    VALUES (?,?,?,?,?,'Other','Pending','Created automatically from EventHub registration')`).run(event.id,registration.id,registration.student_id,registration.team_id,amount)
  return db.prepare('SELECT * FROM payments WHERE id=?').get(result.lastInsertRowid)
}

function notifyStudent(studentId,title,message) {
  if (!studentId) return
  const user = db.prepare("SELECT id FROM users WHERE student_id=? AND active=1").get(studentId)
  if (user) db.prepare("INSERT INTO notifications(user_id,title,message,channel) VALUES (?,?,?,'In-App')").run(user.id,title,message)
}

/*
 * Notify active student accounts that are eligible for an event.
 * Event visibility is independent from registration availability.
 */
function notifyEligibleStudentsForEvent(event, title, message) {
  if (!event) return 0

  const users = db.prepare(`
    SELECT *
    FROM users
    WHERE role='Student'
      AND active=1
      AND student_id IS NOT NULL
  `).all()

  let sent = 0

  for (const user of users) {
    const student = getStudentById(user.student_id)
    if (!student) continue

    if (validateStudentForEvent(student, event).length !== 0) continue

    db.prepare(`
      INSERT INTO notifications(user_id,title,message,channel,event_id,target_url)
      VALUES (?,?,?,'In-App',?,?)
    `).run(user.id, title, message, event.id, `/student/explore?event=${event.id}`)

    sent++
  }

  return sent
}

/*
 * Student event discovery.
 *
 * Approved:
 *   visible, but registration disabled.
 *
 * Published / Registration Open:
 *   visible, with registration controlled by registrationWindowOpen().
 */
function studentVisibleEvents() {
  return db.prepare(`
    SELECT *
    FROM events
    WHERE status IN ('Published','Registration Open')
    ORDER BY date(event_date), start_time
  `).all().map(parseEventRow)
}


function registrationStudentIds(registration) {
  if (registration.student_id) return [registration.student_id]
  if (registration.team_id) return db.prepare("SELECT student_id FROM team_members WHERE team_id=? AND status!='Declined'").all(registration.team_id).map(x=>x.student_id)
  return []
}

function promoteWaitingList(eventId) {
  const event = db.prepare('SELECT * FROM events WHERE id=?').get(eventId)
  if (!event || !event.capacity) return
  const waiting = db.prepare(`SELECT r.* FROM registrations r JOIN waiting_list w ON w.registration_id=r.id
    WHERE r.event_id=? AND r.status='Waiting List' ORDER BY w.position,r.created_at`).all(eventId)
  for (const registration of waiting) {
    const needed = registrationCapacityNeeded(registration.registration_type, registration.team_id)
    const used = registrationSeatCount(eventId)
    if (used + needed > Number(event.capacity)) break
    const next = Boolean(event.registration_approval_required)
      ? 'Waiting for Approval'
      : event.payment_type === 'Paid'
        ? 'Payment Pending'
        : 'Confirmed'
    db.prepare('UPDATE registrations SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(next, registration.id)
    db.prepare('DELETE FROM waiting_list WHERE registration_id=?').run(registration.id)
    if (next === 'Payment Pending') ensurePaymentForRegistration(registration.id)
    registrationStudentIds(registration).forEach(studentId=>notifyStudent(studentId,'Waiting list seat available',`${event.name}: a seat is now available. ${next==='Payment Pending'?'Complete payment to continue.':next==='Waiting for Approval'?'Your registration is waiting for coordinator approval.':'Your registration is now confirmed.'}`))
  }
  const remaining = db.prepare(`SELECT w.id FROM waiting_list w JOIN registrations r ON r.id=w.registration_id WHERE r.event_id=? AND r.status='Waiting List' ORDER BY w.position,w.id`).all(eventId)
  remaining.forEach((row,index)=>db.prepare('UPDATE waiting_list SET position=? WHERE id=?').run(index+1,row.id))
}

function canStudentManageTeam(user, team) {
  return user.role === 'Student' && user.student_id && team.leader_student_id === user.student_id && !['Approved','Locked','Rejected'].includes(team.status)
}

function auditTeam(teamId, action, details, userId) {
  db.prepare('INSERT INTO team_audit_history(team_id,action,details,acted_by) VALUES (?,?,?,?)').run(teamId, action, details || null, userId)
}


// V1.0 complete-platform additive schema. Local development remains zero-config SQLite.
db.exec(`
CREATE TABLE IF NOT EXISTS venues (id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL UNIQUE,type TEXT NOT NULL DEFAULT 'Other',active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS payments (id INTEGER PRIMARY KEY AUTOINCREMENT,event_id INTEGER NOT NULL,registration_id INTEGER,student_id TEXT,team_id INTEGER,amount REAL NOT NULL DEFAULT 0,method TEXT NOT NULL CHECK(method IN ('Razorpay','Cash','Coordinator UPI','Bank Transfer','Other')),provider_reference TEXT,receipt_no TEXT UNIQUE,status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Paid','Failed','Refunded','Voided')),collected_by INTEGER,notes TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(event_id) REFERENCES events(id),FOREIGN KEY(registration_id) REFERENCES registrations(id),FOREIGN KEY(student_id) REFERENCES students(student_id),FOREIGN KEY(team_id) REFERENCES teams(id),FOREIGN KEY(collected_by) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS payment_audit (id INTEGER PRIMARY KEY AUTOINCREMENT,payment_id INTEGER NOT NULL,action TEXT NOT NULL,reason TEXT,acted_by INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(payment_id) REFERENCES payments(id),FOREIGN KEY(acted_by) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS attendance (id INTEGER PRIMARY KEY AUTOINCREMENT,event_id INTEGER NOT NULL,student_id TEXT NOT NULL,team_id INTEGER,check_in_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,method TEXT NOT NULL DEFAULT 'Manual',verified_by INTEGER,status TEXT NOT NULL DEFAULT 'Present' CHECK(status IN ('Present','Absent','Excused','Corrected')),UNIQUE(event_id,student_id),FOREIGN KEY(event_id) REFERENCES events(id),FOREIGN KEY(student_id) REFERENCES students(student_id),FOREIGN KEY(team_id) REFERENCES teams(id),FOREIGN KEY(verified_by) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS identity_verification_requests (id INTEGER PRIMARY KEY AUTOINCREMENT,event_id INTEGER NOT NULL,student_id TEXT NOT NULL,method TEXT NOT NULL DEFAULT 'Photo Review',reason TEXT,approved_by INTEGER,status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Approved','Rejected')),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,reviewed_at TEXT,FOREIGN KEY(event_id) REFERENCES events(id),FOREIGN KEY(student_id) REFERENCES students(student_id),FOREIGN KEY(approved_by) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS results (id INTEGER PRIMARY KEY AUTOINCREMENT,event_id INTEGER NOT NULL,student_id TEXT,team_id INTEGER,award TEXT NOT NULL,position INTEGER,category TEXT,points_awarded INTEGER NOT NULL DEFAULT 0,published INTEGER NOT NULL DEFAULT 0,created_by INTEGER,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(event_id) REFERENCES events(id),FOREIGN KEY(student_id) REFERENCES students(student_id),FOREIGN KEY(team_id) REFERENCES teams(id),FOREIGN KEY(created_by) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS achievement_rules (id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT NOT NULL UNIQUE,label TEXT NOT NULL,points INTEGER NOT NULL,active INTEGER NOT NULL DEFAULT 1);
INSERT OR IGNORE INTO achievement_rules(code,label,points) VALUES ('FIRST','1st Place',100),('SECOND','2nd Place',70),('THIRD','3rd Place',50),('FINALIST','Finalist',30),('PARTICIPATION','Participation',10),('VOLUNTEER','Volunteer',15),('WORKSHOP','Workshop Completion',15);
CREATE TABLE IF NOT EXISTS badges (id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT NOT NULL UNIQUE,name TEXT NOT NULL,description TEXT,active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS certificates (id INTEGER PRIMARY KEY AUTOINCREMENT,certificate_id TEXT NOT NULL UNIQUE,event_id INTEGER NOT NULL,student_id TEXT,team_id INTEGER,type TEXT NOT NULL,template_name TEXT,signatories_json TEXT,issued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,verification_token TEXT UNIQUE,FOREIGN KEY(event_id) REFERENCES events(id),FOREIGN KEY(student_id) REFERENCES students(student_id),FOREIGN KEY(team_id) REFERENCES teams(id));
CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,title TEXT NOT NULL,message TEXT NOT NULL,channel TEXT NOT NULL DEFAULT 'In-App',read_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS gallery_items (id INTEGER PRIMARY KEY AUTOINCREMENT,event_id INTEGER NOT NULL,type TEXT NOT NULL,title TEXT,url TEXT NOT NULL,published INTEGER NOT NULL DEFAULT 0,uploaded_by INTEGER,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(event_id) REFERENCES events(id),FOREIGN KEY(uploaded_by) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS feedback (id INTEGER PRIMARY KEY AUTOINCREMENT,event_id INTEGER NOT NULL,student_id TEXT,rating INTEGER CHECK(rating BETWEEN 1 AND 5),comments TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(event_id) REFERENCES events(id),FOREIGN KEY(student_id) REFERENCES students(student_id));
CREATE TABLE IF NOT EXISTS notices (id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,message TEXT NOT NULL,audience TEXT NOT NULL DEFAULT 'All',priority TEXT NOT NULL DEFAULT 'Normal',expires_at TEXT,created_by INTEGER,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(created_by) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY,value TEXT,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO app_settings(key,value) VALUES ('academic_year','2026-27'),('dark_mode_enabled','true'),('offline_payment_methods','Cash,Coordinator UPI'),('production_database','PostgreSQL'),('certificate_mode','Both');
CREATE TABLE IF NOT EXISTS system_audit (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,action TEXT NOT NULL,entity_type TEXT,entity_id TEXT,details TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES users(id));
`)

addColumn('notifications', "event_id INTEGER")
addColumn('notifications', "target_url TEXT")
addColumn('notifications', "registration_id INTEGER")
;

const publicFeatures = createPublicFeatures({ db, json, parseBody, requireAuth, canCoordinateEvent })
const sheetsSync = createSheetsSync({ db })
const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return json(res, 204, {})
  // Any successful change to the data triggers a (debounced) Google Sheets sync when it is connected.
  res.on('finish', () => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && res.statusCode < 400 && req.url.startsWith('/api/') && !req.url.startsWith('/api/auth/')) sheetsSync.schedule()
  })
  const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`)

  try {
    if (serveWeb(req, res, url, root)) return
    if (await publicFeatures(req, res, url)) return


    // ============================================================
    // GOOGLE SHEETS SYNC (Super Admin only)
    // ============================================================
    if (url.pathname.startsWith('/api/admin/sheets')) {
      const auth = requireAuth(req, res, ['Super Admin']); if (!auth) return
      const audit = (action, details = '') => db.prepare('INSERT INTO system_audit(user_id,action,entity_type,entity_id,details) VALUES (?,?,?,?,?)').run(auth.user.id, action, 'GoogleSheets', 'sync', details)
      if (req.method === 'GET' && url.pathname === '/api/admin/sheets/status') return json(res, 200, { ok: true, ...sheetsSync.status() })
      if (req.method === 'GET' && url.pathname === '/api/admin/sheets/script') {
        let script = ''
        try { script = readFileSync(join(root, 'google-sheets', 'Code.gs'), 'utf8') } catch { return json(res, 404, { ok: false, error: 'google-sheets/Code.gs is missing from the project.' }) }
        return json(res, 200, { ok: true, script })
      }
      if (req.method === 'PATCH' && url.pathname === '/api/admin/sheets/config') {
        const b = await parseBody(req)
        const saved = sheetsSync.saveConfig(b)
        if (!saved.ok) return json(res, 400, saved)
        audit('Connected Google Sheets', `${b.mode === 'api' ? 'Sheet link + service account' : 'Apps Script'}${b.enabled === false ? ', sync switched off' : ''}`)
        const tested = await sheetsSync.test()
        if (tested.ok && b.enabled !== false) void sheetsSync.sync()
        return json(res, 200, { ok: true, test: tested, ...sheetsSync.status() })
      }
      if (req.method === 'DELETE' && url.pathname === '/api/admin/sheets/config') {
        if (sheetsSync.getConfig()?.source === 'environment') return json(res, 400, { ok: false, error: 'This connection comes from server environment variables. Remove them there.' })
        sheetsSync.clearConfig(); audit('Disconnected Google Sheets')
        return json(res, 200, { ok: true, ...sheetsSync.status() })
      }
      if (req.method === 'POST' && url.pathname === '/api/admin/sheets/test') return json(res, 200, await sheetsSync.test())
      if (req.method === 'POST' && url.pathname === '/api/admin/sheets/sync') {
        const b = await parseBody(req).catch(() => ({}))
        const result = await sheetsSync.sync({ full: b.full === true })
        audit(b.full === true ? 'Full Google Sheets resync' : 'Manual Google Sheets sync')
        return json(res, result.ok === false ? 502 : 200, { ok: result.ok !== false, result, ...sheetsSync.status() })
      }
      return json(res, 404, { ok: false, error: 'API route not found.' })
    }

    // ============================================================
    // COORDINATOR FINAL EVENT REPORT
    // Read-only archive report for an authorized event.
    // ============================================================
    if (
      req.method === 'GET' &&
      url.pathname === '/api/coordinator/reports/final'
    ) {
      const auth = requireAuth(
        req,
        res,
        ['Super Admin','HOD','Main Coordinator','Department Coordinator']
      )
      if (!auth) return

      const eventId = Number(url.searchParams.get('event_id') || 0)

      if (!Number.isInteger(eventId) || eventId <= 0) {
        return json(res, 400, {
          ok: false,
          error: 'A valid event_id is required.'
        })
      }

      const eventRow = db.prepare(`
        SELECT
          e.*,
          creator.name AS creator_name,
          mc.name AS main_coordinator_name
        FROM events e
        JOIN users creator ON creator.id=e.created_by
        LEFT JOIN users mc ON mc.id=e.main_coordinator_id
        WHERE e.id=?
      `).get(eventId)

      if (!eventRow) {
        return json(res, 404, {
          ok: false,
          error: 'Event not found.'
        })
      }

      const event = parseEventRow(eventRow)

      if (!canReadEvent(auth.user, event)) {
        return json(res, 403, {
          ok: false,
          error: 'You are not authorized to view this event report.'
        })
      }

      const registrations = db.prepare(`
        SELECT *
        FROM registrations
        WHERE event_id=?
        ORDER BY datetime(created_at)
      `).all(eventId)

      const activeRegistrations = registrations.filter(
        row => !['Cancelled','Rejected'].includes(row.status)
      )

      const registrationSummary = {
        total: registrations.length,
        active: activeRegistrations.length,
        confirmed: registrations.filter(
          row => row.status === 'Confirmed'
        ).length,
        approval_pending: registrations.filter(
          row => row.status === 'Approval Pending'
        ).length,
        payment_pending: registrations.filter(
          row => row.status === 'Payment Pending'
        ).length,
        waiting_list: registrations.filter(
          row => row.status === 'Waiting List'
        ).length,
        cancelled: registrations.filter(
          row => row.status === 'Cancelled'
        ).length,
        rejected: registrations.filter(
          row => row.status === 'Rejected'
        ).length
      }

      const paymentRows = db.prepare(`
        SELECT p.*
        FROM payments p
        JOIN (
          SELECT registration_id, MAX(id) AS latest_id
          FROM payments
          WHERE event_id=?
            AND registration_id IS NOT NULL
          GROUP BY registration_id
        ) latest ON latest.latest_id=p.id
        WHERE p.event_id=?
        ORDER BY p.id
      `).all(eventId, eventId)

      const paidPayments = paymentRows.filter(
        row => row.status === 'Paid'
      )

      const paymentSummary = {
        records: paymentRows.length,
        paid_count: paidPayments.length,
        pending_count: paymentRows.filter(
          row => row.status === 'Pending'
        ).length,
        failed_count: paymentRows.filter(
          row => row.status === 'Failed'
        ).length,
        refunded_count: paymentRows.filter(
          row => row.status === 'Refunded'
        ).length,
        voided_count: paymentRows.filter(
          row => row.status === 'Voided'
        ).length,
        collected_amount: paidPayments.reduce(
          (sum, row) => sum + Number(row.amount || 0),
          0
        ),
        cash_amount: paidPayments
          .filter(row => row.method === 'Cash')
          .reduce((sum,row) => sum + Number(row.amount || 0),0),
        upi_amount: paidPayments
          .filter(row => row.method === 'Coordinator UPI')
          .reduce((sum,row) => sum + Number(row.amount || 0),0),
        online_amount: paidPayments
          .filter(row => row.method === 'Razorpay')
          .reduce((sum,row) => sum + Number(row.amount || 0),0)
      }

      const attendanceRows = db.prepare(`
        SELECT
          a.*,
          s.name AS student_name,
          s.department AS student_department,
          verifier.name AS verified_by_name,
          t.team_name AS team_name
        FROM attendance a
        JOIN students s ON s.student_id=a.student_id
        LEFT JOIN users verifier ON verifier.id=a.verified_by
        LEFT JOIN teams t ON t.id=a.team_id
        WHERE a.event_id=?
        ORDER BY datetime(a.check_in_at), s.name COLLATE NOCASE
      `).all(eventId)

      const attendanceSummary = {
        total_records: attendanceRows.length,
        present: attendanceRows.filter(
          row => row.status === 'Present'
        ).length,
        absent: attendanceRows.filter(
          row => row.status === 'Absent'
        ).length,
        excused: attendanceRows.filter(
          row => row.status === 'Excused'
        ).length,
        corrected: attendanceRows.filter(
          row => row.status === 'Corrected'
        ).length
      }

      const results = db.prepare(`
        SELECT
          r.*,
          s.name AS student_name,
          s.department AS student_department,
          t.team_name AS team_name
        FROM results r
        LEFT JOIN students s ON s.student_id=r.student_id
        LEFT JOIN teams t ON t.id=r.team_id
        WHERE r.event_id=?
          AND r.published=1
        ORDER BY
          CASE WHEN r.position IS NULL THEN 999999 ELSE r.position END,
          r.id
      `).all(eventId)

      const certificates = db.prepare(`
        SELECT
          c.*,
          s.name AS student_name,
          s.department AS student_department,
          t.team_name AS team_name
        FROM certificates c
        LEFT JOIN students s ON s.student_id=c.student_id
        LEFT JOIN teams t ON t.id=c.team_id
        WHERE c.event_id=?
        ORDER BY datetime(c.issued_at), c.id
      `).all(eventId)

      const feedbackRows = db.prepare(`
        SELECT rating
        FROM feedback
        WHERE event_id=?
      `).all(eventId)

      const validRatings = feedbackRows
        .map(row => Number(row.rating))
        .filter(value => Number.isFinite(value))

      const feedbackSummary = {
        responses: validRatings.length,
        average_rating:
          validRatings.length > 0
            ? Number(
                (
                  validRatings.reduce((sum,value) => sum + value,0) /
                  validRatings.length
                ).toFixed(2)
              )
            : null
      }

      return json(res, 200, {
        ok: true,
        event,
        registrations: registrationSummary,
        payments: paymentSummary,
        attendance: attendanceSummary,
        attendance_rows: attendanceRows,
        results,
        certificates,
        feedback: feedbackSummary,
        generated_at: new Date().toISOString()
      })
    }
    if (req.method === 'GET' && url.pathname === '/api/health') {
      return json(res, 200, { ok: true, service: 'GEMS EventHub API' })
    }


    if (req.method === 'GET' && url.pathname === '/api/public/events') {
      // Posters can be large images, so the list only carries a short link; the image itself is served below and cached by the browser.
      const rows = db.prepare("SELECT * FROM events WHERE status IN ('Published','Registration Open','Ongoing','Completed','Results Published','Certificates Issued') ORDER BY date(event_date),start_time").all().map(parseEventRow)
        .map((row) => ({ ...row, poster_url: row.poster_url ? `/api/public/events/${row.id}/poster?v=${encodeURIComponent(String(row.updated_at || ''))}` : null }))
      return json(res,200,{ok:true,rows})
    }

    // Public event poster image (stored in the database as a data URL or a normal link).
    const posterMatch = url.pathname.match(/^\/api\/public\/events\/(\d+)\/poster$/)
    if (req.method === 'GET' && posterMatch) {
      const row = db.prepare("SELECT poster_url FROM events WHERE id=? AND status IN ('Published','Registration Open','Ongoing','Completed','Results Published','Certificates Issued')").get(Number(posterMatch[1]))
      const value = String(row?.poster_url || '').trim()
      const inline = value.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/)
      if (inline) {
        const image = Buffer.from(inline[2].replace(/\s/g, ''), 'base64')
        res.writeHead(200, { 'Content-Type': inline[1], 'Content-Length': image.length, 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff', 'Access-Control-Allow-Origin': '*' })
        return res.end(image)
      }
      if (/^https?:\/\//i.test(value) || /^\/(?!\/)/.test(value)) { res.writeHead(302, { Location: value }); return res.end() }
      return json(res, 404, { ok: false, error: 'This event has no poster.' })
    }

    // First-run setup. The route permanently closes after the first user exists.
    if (req.method === 'GET' && url.pathname === '/api/setup/status') {
      const count = db.prepare('SELECT COUNT(*) AS count FROM users').get().count
      return json(res, 200, { setup_required: count === 0 })
    }

    if (req.method === 'POST' && url.pathname === '/api/setup/admin') {
      const count = db.prepare('SELECT COUNT(*) AS count FROM users').get().count
      if (count > 0) return json(res, 409, { ok: false, error: 'Initial setup has already been completed.' })
      const body = await parseBody(req)
      const name = clean(body.name)
      const email = clean(body.email).toLowerCase()
      const collegeId = clean(body.college_id || body.collegeId) || 'ADMIN-001'
      const password = String(body.password || '')
      if (!name || !email || password.length < 10) {
        return json(res, 400, { ok: false, error: 'Name, email and a password of at least 10 characters are required.' })
      }
      const { hash, salt } = hashPassword(password)
      db.prepare(`INSERT INTO users (name,email,college_id,role,department,password_hash,password_salt)
                  VALUES (?,?,?,?,?,?,?)`)
        .run(name, email, collegeId, 'Super Admin', 'Administration', hash, salt)
      const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email)
      const session = createSession(user.id)
      return json(res, 201, { ok: true, user: publicUser(user), ...session })
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/login') {
      const body = await parseBody(req)
      const identifier = clean(body.identifier).toLowerCase()
      const password = String(body.password || '')
      if (!identifier || !password) return json(res, 400, { ok: false, error: 'College ID/email and password are required.' })
      const user = db.prepare(`SELECT * FROM users WHERE lower(email)=? OR lower(college_id)=? OR lower(student_id)=?`).get(identifier, identifier, identifier)
      if (!user || !user.active || !verifyPassword(password, user.password_hash, user.password_salt)) {
        return json(res, 401, { ok: false, error: 'The College ID/email or password is incorrect.' })
      }
      db.prepare("DELETE FROM auth_sessions WHERE datetime(expires_at) <= datetime('now')").run()
      const session = createSession(user.id)
      return json(res, 200, { ok: true, user: publicUser(user), ...session })
    }

    if (req.method === 'GET' && url.pathname === '/api/auth/me') {
      const auth = requireAuth(req, res)
      if (!auth) return
      return json(res, 200, { ok: true, user: publicUser(auth.user) })
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
      const auth = getAuth(req)
      if (auth) db.prepare('DELETE FROM auth_sessions WHERE id = ?').run(auth.session_id)
      return json(res, 200, { ok: true })
    }

    // User management is Super Admin only.
    if (req.method === 'GET' && url.pathname === '/api/users') {
      const auth = requireAuth(req, res, ['Super Admin'])
      if (!auth) return
      const rows = db.prepare(`SELECT id,name,email,college_id,role,department,student_id,active,created_at
                               FROM users ORDER BY role,name COLLATE NOCASE`).all()
      return json(res, 200, { rows: rows.map((r) => ({ ...r, active: Boolean(r.active) })) })
    }

    if (req.method === 'POST' && url.pathname === '/api/users') {
      const auth = requireAuth(req, res, ['Super Admin'])
      if (!auth) return
      const body = await parseBody(req)
      const name = clean(body.name)
      const email = clean(body.email).toLowerCase() || null
      const collegeId = clean(body.college_id || body.collegeId) || null
      const role = clean(body.role)
      const department = clean(body.department) || null
      const studentId = clean(body.student_id || body.studentId) || null
      const password = String(body.password || '')

      if (!name || !allowedRoles.includes(role)) return json(res, 400, { ok: false, error: 'Name and a valid role are required.' })
      if (!email && !collegeId && !studentId) return json(res, 400, { ok: false, error: 'Provide an email, College ID or Student ID.' })
      if (password.length < 10) return json(res, 400, { ok: false, error: 'Temporary password must be at least 10 characters.' })
      if (['HOD','Main Coordinator','Department Coordinator','Librarian'].includes(role) && !allowedDepartments.includes(department)) {
        return json(res, 400, { ok: false, error: 'A valid department is required for this role.' })
      }
      if (role === 'Student') {
        if (!studentId || !getStudentById(studentId)) return json(res, 400, { ok: false, error: 'Student role must be linked to an existing Student ID.' })
      }
      const { hash, salt } = hashPassword(password)
      try {
        const result = db.prepare(`INSERT INTO users (name,email,college_id,role,department,student_id,password_hash,password_salt)
          VALUES (?,?,?,?,?,?,?,?)`).run(name,email,collegeId,role,department,studentId,hash,salt)
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid)
        return json(res, 201, { ok: true, user: publicUser(user) })
      } catch (error) {
        if (String(error?.message || error).includes('UNIQUE constraint failed')) {
          return json(res, 409, { ok: false, error: 'That email, College ID or Student ID already has an account.' })
        }
        throw error
      }
    }

    // Bulk user import - Super Admin only.
    if (req.method === 'POST' && url.pathname === '/api/users/bulk-import') {
      const auth = requireAuth(req, res, ['Super Admin'])
      if (!auth) return

      const body = await parseBody(req)
      const inputRows = Array.isArray(body.rows) ? body.rows : []

      if (!inputRows.length) {
        return json(res, 400, {
          ok: false,
          error: 'No user rows were supplied.'
        })
      }

      if (inputRows.length > 1000) {
        return json(res, 400, {
          ok: false,
          error: 'A maximum of 1000 users can be imported at one time.'
        })
      }

      const imported = []
      const failed = []

      const existingEmail = db.prepare(
        'SELECT id FROM users WHERE lower(email)=lower(?)'
      )

      const existingCollegeId = db.prepare(
        'SELECT id FROM users WHERE lower(college_id)=lower(?)'
      )

      const existingStudentId = db.prepare(
        'SELECT id FROM users WHERE lower(student_id)=lower(?)'
      )

      const insertUser = db.prepare(`
        INSERT INTO users
        (
          name,
          email,
          college_id,
          role,
          department,
          student_id,
          password_hash,
          password_salt
        )
        VALUES (?,?,?,?,?,?,?,?)
      `)

      for (let index = 0; index < inputRows.length; index += 1) {
        const source = inputRows[index] || {}
        const rowNumber = Number(source.row_number || index + 2)

        const name = clean(source.name)
        const email = clean(source.email).toLowerCase() || null
        const collegeId =
          clean(source.college_id || source.collegeId) || null
        const role = clean(source.role)
        let department = clean(source.department) || null
        const studentId =
          clean(source.student_id || source.studentId) || null
        const password = String(source.password || '')

        let reason = ''

        if (!name) {
          reason = 'Name is required.'
        } else if (!allowedRoles.includes(role)) {
          reason = 'Invalid role.'
        } else if (!email && !collegeId && !studentId) {
          reason = 'Provide an email, College ID or Student ID.'
        } else if (password.length < 10) {
          reason = 'Temporary password must be at least 10 characters.'
        } else if (
          ['HOD','Main Coordinator','Department Coordinator','Librarian']
            .includes(role) &&
          !allowedDepartments.includes(department)
        ) {
          reason = 'A valid department is required for this role.'
        }

        let student = null

        if (!reason && role === 'Student') {
          if (!studentId) {
            reason = 'Student ID is required for Student accounts.'
          } else {
            student = getStudentById(studentId)

            if (!student) {
              reason = 'Student ID was not found in Student Directory.'
            } else {
              department = student.department || department
            }
          }
        }

        if (!reason && email && existingEmail.get(email)) {
          reason = 'Email already has an account.'
        }

        if (!reason && collegeId && existingCollegeId.get(collegeId)) {
          reason = 'College ID already has an account.'
        }

        if (!reason && studentId && existingStudentId.get(studentId)) {
          reason = 'Student ID already has an account.'
        }

        if (reason) {
          failed.push({
            row_number: rowNumber,
            name,
            email,
            college_id: collegeId,
            student_id: studentId,
            error: reason
          })
          continue
        }

        try {
          const { hash, salt } = hashPassword(password)

          const result = insertUser.run(
            name,
            email,
            collegeId,
            role,
            department,
            studentId,
            hash,
            salt
          )

          imported.push({
            row_number: rowNumber,
            id: Number(result.lastInsertRowid),
            name,
            role,
            department,
            student_id: studentId
          })
        } catch (error) {
          const message = String(error?.message || error)

          failed.push({
            row_number: rowNumber,
            name,
            email,
            college_id: collegeId,
            student_id: studentId,
            error: message.includes('UNIQUE constraint failed')
              ? 'Email, College ID or Student ID already has an account.'
              : 'Could not create this account.'
          })
        }
      }

      db.prepare(`
        INSERT INTO system_audit
        (
          user_id,
          action,
          entity_type,
          entity_id,
          details
        )
        VALUES (?,?,?,?,?)
      `).run(
        auth.user.id,
        'Bulk imported users',
        'User',
        'bulk',
        `${imported.length} imported, ${failed.length} failed`
      )

      return json(res, 200, {
        ok: true,
        total: inputRows.length,
        imported_count: imported.length,
        failed_count: failed.length,
        imported,
        failed
      })
    }
    const resetPasswordMatch = url.pathname.match(/^\/api\/users\/(\d+)\/reset-password$/)
    if (resetPasswordMatch && req.method === 'POST') {
      const auth = requireAuth(req,res,['Super Admin']); if(!auth)return
      const id=Number(resetPasswordMatch[1]);const current=db.prepare('SELECT * FROM users WHERE id=?').get(id);if(!current)return json(res,404,{ok:false,error:'User not found.'})
      const body=await parseBody(req);const password=String(body.password||'');if(password.length<10)return json(res,400,{ok:false,error:'New temporary password must be at least 10 characters.'})
      const {hash,salt}=hashPassword(password);db.prepare('UPDATE users SET password_hash=?,password_salt=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(hash,salt,id);db.prepare('DELETE FROM auth_sessions WHERE user_id=?').run(id)
      return json(res,200,{ok:true,message:'Password reset successfully. Existing sessions were signed out.'})
    }

    const userMatch = url.pathname.match(/^\/api\/users\/(\d+)$/)
    if (userMatch && req.method === 'PATCH') {
      const auth = requireAuth(req, res, ['Super Admin'])
      if (!auth) return
      const id = Number(userMatch[1])
      const current = db.prepare('SELECT * FROM users WHERE id = ?').get(id)
      if (!current) return json(res, 404, { ok: false, error: 'User not found.' })
      const body = await parseBody(req)
      const active = body.active === undefined ? current.active : (body.active ? 1 : 0)
      const role = clean(body.role) || current.role
      const department = body.department === undefined ? current.department : (clean(body.department) || null)
      if (!allowedRoles.includes(role)) return json(res, 400, { ok: false, error: 'Invalid role.' })
      if (id === auth.user.id && active === 0) return json(res, 400, { ok: false, error: 'You cannot deactivate your own account.' })
      db.prepare('UPDATE users SET role=?,department=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
        .run(role, department, active, id)
      return json(res, 200, { ok: true, user: publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(id)) })
    }

    // Event creation + approval workflow (V3.1 foundation).
    if (req.method === 'GET' && url.pathname === '/api/events/manage') {
      const auth = requireAuth(req, res, ['Super Admin','HOD','Main Coordinator','Department Coordinator'])
      if (!auth) return
      const where = []
      const params = []
      if (auth.user.role === 'HOD') { where.push('e.organizing_department = ?'); params.push(auth.user.department) }
      if (auth.user.role === 'Librarian') { where.push("e.event_scope='Library' AND (e.created_by=? OR e.main_coordinator_id=?)"); params.push(auth.user.id, auth.user.id) }
      if (auth.user.role === 'Department Coordinator') {
        where.push(`(
          e.organizing_department = ?
          OR EXISTS (
            SELECT 1
            FROM event_department_coordinators edc
            WHERE edc.event_id=e.id
              AND edc.user_id=?
          )
        )`)

        params.push(
          auth.user.department,
          auth.user.id
        )
      }
      if (auth.user.role === 'Main Coordinator') { where.push('(e.created_by = ? OR e.main_coordinator_id = ?)'); params.push(auth.user.id, auth.user.id) }
      const status = clean(url.searchParams.get('status'))
      if (status) { where.push('e.status = ?'); params.push(status) }
      const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
      const rows = db.prepare(`SELECT e.*, creator.name AS creator_name, mc.name AS main_coordinator_name
        FROM events e
        JOIN users creator ON creator.id=e.created_by
        LEFT JOIN users mc ON mc.id=e.main_coordinator_id
        ${clause}
        ORDER BY date(e.event_date) DESC, e.created_at DESC`).all(...params)
      return json(res, 200, { rows: rows.map(parseEventRow) })
    }

    if (req.method === 'GET' && url.pathname === '/api/events/coordinators') {
      const auth = requireAuth(
        req,
        res,
        ['Super Admin','HOD','Main Coordinator','Department Coordinator']
      )
      if (!auth) return

      const department = clean(
        url.searchParams.get('department')
      )

      let rows = db.prepare(`
        SELECT id,name,role,department
        FROM users
        WHERE active=1
          AND role='Department Coordinator'
        ORDER BY department,name COLLATE NOCASE
      `).all()

      if (department) {
        rows = rows.filter(
          row => row.department === department
        )
      }

      if (
        auth.user.role === 'Department Coordinator' ||
        auth.user.role === 'HOD'
      ) {
        rows = rows.filter(
          row => row.department === auth.user.department
        )
      }

      return json(res,200,{rows})
    }

    if (req.method === 'POST' && url.pathname === '/api/events') {
      const auth = requireAuth(req, res, ['Super Admin','Main Coordinator','Department Coordinator'])
      if (!auth) return
      const body = await parseBody(req)
      const event = normalizeEvent(body, auth.user)
      const errors = validateEvent(event, auth.user)
      if (errors.length) return json(res, 400, { ok: false, errors, error: errors[0] })
      const code = eventCode()
      const result = db.prepare(`INSERT INTO events
        (event_code,name,description,category,organizing_department,event_scope,scope_label,event_date,start_time,end_time,venue,capacity,registration_open,registration_deadline,registration_mode,team_min,team_max,payment_type,fee,online_payment,offline_payment,eligible_departments,eligible_years,eligible_semesters,rules,prizes,requirements,contact_info,registration_approval_required,created_by,main_coordinator_id,participation_type,allow_student_teams,allow_coordinator_teams,team_name_required,member_approval_required,coordinator_team_approval_required,allow_member_replacement,one_team_per_student,team_fee_mode)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
          code,event.name,event.description,event.category,event.organizing_department,event.event_scope,event.scope_label,event.event_date,event.start_time,event.end_time,event.venue,event.capacity,event.registration_open,event.registration_deadline,event.registration_mode,event.team_min,event.team_max,event.payment_type,event.fee,event.online_payment?1:0,event.offline_payment?1:0,event.eligible_departments,event.eligible_years,event.eligible_semesters,event.rules,event.prizes,event.requirements,event.contact_info,event.registration_approval_required?1:0,auth.user.id,event.main_coordinator_id,event.participation_type,event.allow_student_teams?1:0,event.allow_coordinator_teams?1:0,event.team_name_required?1:0,event.member_approval_required?1:0,event.coordinator_team_approval_required?1:0,event.allow_member_replacement?1:0,event.one_team_per_student?1:0,event.team_fee_mode
        )
      const createdId = Number(result.lastInsertRowid)

      db.prepare(
        'UPDATE events SET poster_url=? WHERE id=?'
      ).run(
        clean(body.poster_url) || null,
        createdId
      )

      // Super Admin does not require HOD approval.
      if (['Super Admin','Main Coordinator'].includes(auth.user.role)) {
        db.prepare("UPDATE events SET status='Approved',approved_at=CURRENT_TIMESTAMP,approved_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
          .run(auth.user.id, createdId)

        db.prepare(
          'INSERT INTO event_approval_history(event_id,action,comment,acted_by) VALUES (?,?,?,?)'
        ).run(
          createdId,
          'Approved',
          `Automatically approved because the event was created by ${auth.user.role}.`,
          auth.user.id
        )
      }

      const row = db.prepare('SELECT * FROM events WHERE id=?').get(createdId)

      syncEventDepartmentCoordinators(
        createdId,
        body.department_coordinator_ids || [],
        parseEventRow(row)
      )

      return json(res, 201, {
        ok: true,
        event: parseEventRow(row)
      })
    }

    const eventMatch = url.pathname.match(/^\/api\/events\/(\d+)$/)
    if (eventMatch && req.method === 'GET') {
      const auth = requireAuth(req, res, ['Super Admin','HOD','Main Coordinator','Department Coordinator'])
      if (!auth) return
      const row = db.prepare(`SELECT e.*, creator.name AS creator_name, mc.name AS main_coordinator_name FROM events e
        JOIN users creator ON creator.id=e.created_by LEFT JOIN users mc ON mc.id=e.main_coordinator_id WHERE e.id=?`).get(Number(eventMatch[1]))
      if (!row) return json(res,404,{ok:false,error:'Event not found.'})
      if (auth.user.role === 'HOD' && row.organizing_department !== auth.user.department) return json(res,403,{ok:false,error:'You can only review events from your department.'})
      if (['Main Coordinator','Department Coordinator','Librarian'].includes(auth.user.role) && !canManageEvent(auth.user,row)) return json(res,403,{ok:false,error:'You do not have access to this event.'})
      const history = db.prepare(`SELECT h.*,u.name AS acted_by_name,u.role AS acted_by_role FROM event_approval_history h JOIN users u ON u.id=h.acted_by WHERE h.event_id=? ORDER BY h.created_at DESC`).all(row.id)

      const departmentCoordinators = db.prepare(`
        SELECT
          u.id,
          u.name,
          u.role,
          u.department
        FROM event_department_coordinators edc
        JOIN users u ON u.id=edc.user_id
        WHERE edc.event_id=?
        ORDER BY u.department,u.name COLLATE NOCASE
      `).all(row.id)

      return json(res,200,{
        event:parseEventRow(row),
        history,
        department_coordinators:departmentCoordinators
      })
    }

    if (eventMatch && req.method === 'DELETE') {
      const auth = requireAuth(req, res, ['Super Admin'])
      if (!auth) return

      const id = Number(eventMatch[1])
      const event = db.prepare('SELECT * FROM events WHERE id=?').get(id)
      if (!event) return json(res,404,{ok:false,error:'Event not found.'})

      const counts = {
        registrations:Number(db.prepare('SELECT COUNT(*) AS c FROM registrations WHERE event_id=?').get(id)?.c || 0),
        payments:Number(db.prepare('SELECT COUNT(*) AS c FROM payments WHERE event_id=?').get(id)?.c || 0),
        attendance:Number(db.prepare('SELECT COUNT(*) AS c FROM attendance WHERE event_id=?').get(id)?.c || 0),
        results:Number(db.prepare('SELECT COUNT(*) AS c FROM results WHERE event_id=?').get(id)?.c || 0),
        certificates:Number(db.prepare('SELECT COUNT(*) AS c FROM certificates WHERE event_id=?').get(id)?.c || 0)
      }

      db.exec('BEGIN')
      try {
        db.prepare('DELETE FROM payments WHERE event_id=?').run(id)
        db.prepare('DELETE FROM attendance WHERE event_id=?').run(id)
        db.prepare('DELETE FROM identity_verification_requests WHERE event_id=?').run(id)
        db.prepare('DELETE FROM results WHERE event_id=?').run(id)
        db.prepare('DELETE FROM certificates WHERE event_id=?').run(id)
        db.prepare('DELETE FROM gallery_items WHERE event_id=?').run(id)
        db.prepare('DELETE FROM feedback WHERE event_id=?').run(id)
        db.prepare('UPDATE notifications SET event_id=NULL,target_url=NULL WHERE event_id=?').run(id)
        db.prepare('DELETE FROM events WHERE id=?').run(id)
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }

      return json(res,200,{
        ok:true,
        message:event.name + ' was deleted.',
        deleted:counts
      })
    }

    if (eventMatch && req.method === 'PATCH') {
      const auth = requireAuth(req, res, ['Super Admin','Main Coordinator','Department Coordinator'])
      if (!auth) return
      const id = Number(eventMatch[1])
      const current = db.prepare('SELECT * FROM events WHERE id=?').get(id)
      if (!current) return json(res,404,{ok:false,error:'Event not found.'})
      if (!canManageEvent(auth.user,current)) return json(res,403,{ok:false,error:'You do not have permission to edit this event.'})
      if (['Department Coordinator','Librarian'].includes(auth.user.role) && !['Draft','Changes Requested'].includes(current.status)) return json(res,409,{ok:false,error:'Department Coordinator can edit only draft events or events returned for changes.'})
      if (auth.user.role === 'Main Coordinator' && !['Draft','Changes Requested','Approved'].includes(current.status)) return json(res,409,{ok:false,error:'Published or closed events can no longer be edited by the Main Coordinator.'})
      const body = await parseBody(req)
      const event = normalizeEvent(body,auth.user,current)
      const errors = validateEvent(event,auth.user)
      if (errors.length) return json(res,400,{ok:false,errors,error:errors[0]})
      db.prepare(`UPDATE events SET name=?,description=?,category=?,organizing_department=?,event_scope=?,scope_label=?,event_date=?,start_time=?,end_time=?,venue=?,capacity=?,registration_open=?,registration_deadline=?,registration_mode=?,team_min=?,team_max=?,payment_type=?,fee=?,online_payment=?,offline_payment=?,eligible_departments=?,eligible_years=?,eligible_semesters=?,rules=?,prizes=?,requirements=?,contact_info=?,registration_approval_required=?,main_coordinator_id=?,participation_type=?,allow_student_teams=?,allow_coordinator_teams=?,team_name_required=?,member_approval_required=?,coordinator_team_approval_required=?,allow_member_replacement=?,one_team_per_student=?,team_fee_mode=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(
        event.name,event.description,event.category,event.organizing_department,event.event_scope,event.scope_label,event.event_date,event.start_time,event.end_time,event.venue,event.capacity,event.registration_open,event.registration_deadline,event.registration_mode,event.team_min,event.team_max,event.payment_type,event.fee,event.online_payment?1:0,event.offline_payment?1:0,event.eligible_departments,event.eligible_years,event.eligible_semesters,event.rules,event.prizes,event.requirements,event.contact_info,event.registration_approval_required?1:0,event.main_coordinator_id,event.participation_type,event.allow_student_teams?1:0,event.allow_coordinator_teams?1:0,event.team_name_required?1:0,event.member_approval_required?1:0,event.coordinator_team_approval_required?1:0,event.allow_member_replacement?1:0,event.one_team_per_student?1:0,event.team_fee_mode,id)

      db.prepare(
        'UPDATE events SET poster_url=?,updated_at=CURRENT_TIMESTAMP WHERE id=?'
      ).run(
        clean(body.poster_url) || null,
        id
      )

      if (
        ['Super Admin','Main Coordinator'].includes(auth.user.role) &&
        ['Draft','Submitted','Changes Requested','Rejected'].includes(current.status)
      ) {
        db.prepare(
          "UPDATE events SET status='Approved',approval_comment=NULL,approved_at=CURRENT_TIMESTAMP,approved_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?"
        ).run(auth.user.id,id)

        db.prepare(
          'INSERT INTO event_approval_history(event_id,action,comment,acted_by) VALUES (?,?,?,?)'
        ).run(
          id,
          'Approved',
          `HOD approval bypassed for ${auth.user.role}.`,
          auth.user.id
        )
      }

      const updatedEvent = parseEventRow(
        db.prepare('SELECT * FROM events WHERE id=?').get(id)
      )

      if (
        ['Approved','Published','Registration Open'].includes(updatedEvent.status)
      ) {
        notifyEligibleStudentsForEvent(
          updatedEvent,
          'Event Updated',
          `${updatedEvent.name} has been updated. Check the event details for the latest date, time, venue, registration and other information.`
        )
      }

      if (Array.isArray(body.department_coordinator_ids)) {
        syncEventDepartmentCoordinators(
          id,
          body.department_coordinator_ids,
          updatedEvent
        )
      }

      return json(res,200,{ok:true,event:updatedEvent})
    }

    const submitMatch = url.pathname.match(/^\/api\/events\/(\d+)\/submit$/)
    if (submitMatch && req.method === 'POST') {
      const auth = requireAuth(req,res,['Super Admin','Main Coordinator','Department Coordinator'])
      if (!auth) return
      const id=Number(submitMatch[1]); const event=db.prepare('SELECT * FROM events WHERE id=?').get(id)
      if(!event) return json(res,404,{ok:false,error:'Event not found.'})
      if(!canManageEvent(auth.user,event)) return json(res,403,{ok:false,error:'You do not have permission to submit this event.'})
      if (['Super Admin','Main Coordinator'].includes(auth.user.role)) {
        if (event.status !== 'Approved' && event.status !== 'Published') {
          db.prepare(
            "UPDATE events SET status='Approved',approval_comment=NULL,approved_at=CURRENT_TIMESTAMP,approved_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?"
          ).run(auth.user.id,id)

          db.prepare(
            'INSERT INTO event_approval_history(event_id,action,comment,acted_by) VALUES (?,?,?,?)'
          ).run(
            id,
            'Approved',
            `HOD approval bypassed for ${auth.user.role}.`,
            auth.user.id
          )
        }

        return json(res,200,{
          ok:true,
          event:parseEventRow(
            db.prepare('SELECT * FROM events WHERE id=?').get(id)
          ),
          message:'HOD approval is not required for this role.'
        })
      }
      if(!['Draft','Changes Requested'].includes(event.status)) return json(res,409,{ok:false,error:'This event cannot be submitted in its current state.'})
      const normalized=normalizeEvent(event,auth.user,event); const errors=validateEvent(normalized,auth.user)
      if(errors.length) return json(res,400,{ok:false,errors,error:errors[0]})
      db.prepare("UPDATE events SET status='Submitted',approval_comment=NULL,submitted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(id)
      db.prepare('INSERT INTO event_approval_history(event_id,action,comment,acted_by) VALUES (?,?,?,?)').run(id,'Submitted for Approval',null,auth.user.id)
      return json(res,200,{ok:true,event:parseEventRow(db.prepare('SELECT * FROM events WHERE id=?').get(id))})
    }

    const approvalMatch = url.pathname.match(/^\/api\/events\/(\d+)\/approval$/)
    if (approvalMatch && req.method === 'POST') {
      const auth=requireAuth(req,res,['Super Admin','HOD']); if(!auth) return
      const id=Number(approvalMatch[1]); const event=db.prepare('SELECT * FROM events WHERE id=?').get(id)
      if(!event) return json(res,404,{ok:false,error:'Event not found.'})
      if(auth.user.role==='HOD' && event.organizing_department!==auth.user.department) return json(res,403,{ok:false,error:'You can only approve events from your department.'})
      if(event.status!=='Submitted') return json(res,409,{ok:false,error:'Only submitted events can be reviewed.'})
      const body=await parseBody(req); const action=clean(body.action); const comment=clean(body.comment)||null
      const statusMap={approve:'Approved',changes:'Changes Requested',reject:'Rejected'}
      const next=statusMap[action]
      if(!next) return json(res,400,{ok:false,error:'Choose Approve, Request Changes or Reject.'})
      if((action==='changes'||action==='reject')&&!comment) return json(res,400,{ok:false,error:'A comment is required when requesting changes or rejecting an event.'})
      db.prepare(`UPDATE events SET status=?,approval_comment=?,approved_at=?,approved_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(next,comment,action==='approve'?new Date().toISOString():null,action==='approve'?auth.user.id:null,id)
      db.prepare('INSERT INTO event_approval_history(event_id,action,comment,acted_by) VALUES (?,?,?,?)').run(id,next,comment,auth.user.id)

      const reviewedEvent = parseEventRow(
        db.prepare('SELECT * FROM events WHERE id=?').get(id)
      )


      return json(res,200,{ok:true,event:reviewedEvent})
    }

    const publishMatch = url.pathname.match(/^\/api\/events\/(\d+)\/publish$/)
    if (publishMatch && req.method === 'POST') {
      const auth=requireAuth(req,res,['Super Admin','Main Coordinator']); if(!auth) return
      const id=Number(publishMatch[1]); const event=db.prepare('SELECT * FROM events WHERE id=?').get(id)
      if(!event) return json(res,404,{ok:false,error:'Event not found.'})
      if(auth.user.role!=='Super Admin' && !canManageEvent(auth.user,event)) return json(res,403,{ok:false,error:'You do not have permission to publish this event.'})
      if(event.status!=='Approved') return json(res,409,{ok:false,error:'The event must be approved before it can be published.'})
      db.prepare("UPDATE events SET status='Published',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(id)
      db.prepare('INSERT INTO event_approval_history(event_id,action,comment,acted_by) VALUES (?,?,?,?)').run(id,'Published',null,auth.user.id)

      const publishedEvent = parseEventRow(
        db.prepare('SELECT * FROM events WHERE id=?').get(id)
      )

      notifyEligibleStudentsForEvent(
        publishedEvent,
        `New Event: ${publishedEvent.name}`,
        publishedEvent.registration_open && registrationWindowOpen(publishedEvent)
          ? `${publishedEvent.name} is now live. ${publishedEvent.event_date} • ${publishedEvent.start_time}${publishedEvent.venue ? ` • ${publishedEvent.venue}` : ''}. Registration is open now.`
          : `${publishedEvent.name} is now live. ${publishedEvent.event_date} • ${publishedEvent.start_time}${publishedEvent.venue ? ` • ${publishedEvent.venue}` : ''}. Open EventHub to view the event details.`
      )

      return json(res,200,{ok:true,event:publishedEvent})
    }




    const completeMatch = url.pathname.match(/^\/api\/events\/(\d+)\/complete$/)
    if (completeMatch && req.method === 'POST') {
      const auth=requireAuth(req,res,['Super Admin','Main Coordinator']); if(!auth) return
      const id=Number(completeMatch[1])
      const event=db.prepare('SELECT * FROM events WHERE id=?').get(id)

      if(!event) {
        return json(res,404,{ok:false,error:'Event not found.'})
      }

      if(auth.user.role!=='Super Admin' && !canManageEvent(auth.user,event)) {
        return json(res,403,{ok:false,error:'You do not have permission to complete this event.'})
      }

      if(!['Published','Registration Open'].includes(event.status)) {
        return json(res,409,{
          ok:false,
          error:'Only a published event can be marked completed.'
        })
      }

      db.prepare(`
        UPDATE events
        SET status='Completed',
            registration_open=0,
            updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).run(id)

      db.prepare(`
        INSERT INTO event_approval_history(
          event_id,
          action,
          comment,
          acted_by
        )
        VALUES (?,?,?,?)
      `).run(
        id,
        'Completed',
        'Event marked as completed.',
        auth.user.id
      )

      const completedEvent=parseEventRow(
        db.prepare('SELECT * FROM events WHERE id=?').get(id)
      )

      return json(res,200,{
        ok:true,
        event:completedEvent,
        message:`${completedEvent.name} has been moved to Event History.`
      })
    }

    // V3.4 — registrations, capacity and automatic waiting list.
    if (req.method === 'GET' && url.pathname === '/api/registration-events') {
      const auth = requireAuth(req,res,['Student','Super Admin','Main Coordinator','Department Coordinator']); if(!auth)return
      let rows = studentVisibleEvents()
      if (auth.user.role === 'Student') {
        const student = auth.user.student_id ? getStudentById(auth.user.student_id) : null
        if (!student) return json(res,409,{ok:false,error:'Your account is not linked to a Student Directory record.'})
        rows = rows.filter(e=>validateStudentForEvent(student,e).length===0)
      } else if (auth.user.role === 'Department Coordinator') rows = rows.filter(e=>e.organizing_department===auth.user.department)
      else if (['Main Coordinator','Librarian'].includes(auth.user.role)) rows = rows.filter(e=>canCoordinateEvent(auth.user,e))
      rows = rows.map(e=>({...e,seats_used:registrationSeatCount(e.id),seats_remaining:e.capacity?Math.max(0,Number(e.capacity)-registrationSeatCount(e.id)):null,registration_open_now:registrationWindowOpen(e)}))
      return json(res,200,{rows})
    }

    if (req.method === 'GET' && url.pathname === '/api/registrations/my') {
      const auth=requireAuth(req,res,['Student']); if(!auth)return
      if(!auth.user.student_id)return json(res,409,{ok:false,error:'Your account is not linked to a Student Directory record.'})
      const teamIds=db.prepare('SELECT team_id FROM team_members WHERE student_id=?').all(auth.user.student_id).map(r=>r.team_id)
      const ids=db.prepare("SELECT id FROM registrations WHERE student_id=? ORDER BY created_at DESC").all(auth.user.student_id).map(r=>r.id)
      if(teamIds.length){const placeholders=teamIds.map(()=>'?').join(',');ids.push(...db.prepare(`SELECT id FROM registrations WHERE team_id IN (${placeholders}) ORDER BY created_at DESC`).all(...teamIds).map(r=>r.id))}
      const unique=[...new Set(ids)]
      return json(res,200,{rows:unique.map(id=>registrationPayload(db.prepare('SELECT * FROM registrations WHERE id=?').get(id)))})
    }

    if (req.method === 'GET' && url.pathname === '/api/registrations/admin') {
      const auth=requireAuth(req,res,['Super Admin']); if(!auth)return
      const eventId=Number(url.searchParams.get('event_id')||0)
      const status=clean(url.searchParams.get('status'))
      const q=clean(url.searchParams.get('q'))
      const cond=[]; const params=[]
      if(eventId){cond.push('r.event_id=?');params.push(eventId)}
      if(status){cond.push('r.status=?');params.push(status)}
      if(q){cond.push('(s.name LIKE ? OR s.student_id LIKE ? OR t.team_name LIKE ? OR e.name LIKE ? OR e.event_code LIKE ?)');const term=`%${q}%`;params.push(term,term,term,term,term)}
      const where=cond.length?`WHERE ${cond.join(' AND ')}`:''
      const rows=db.prepare(`SELECT r.id FROM registrations r JOIN events e ON e.id=r.event_id LEFT JOIN students s ON s.student_id=r.student_id LEFT JOIN teams t ON t.id=r.team_id ${where} ORDER BY r.created_at DESC`).all(...params)
      const events=db.prepare('SELECT id,event_code,name FROM events ORDER BY date(event_date) DESC,name').all()
      return json(res,200,{ok:true,rows:rows.map(x=>registrationPayload(db.prepare('SELECT * FROM registrations WHERE id=?').get(x.id))),events})
    }

    // ============================================================
    // COORDINATOR PAYMENT VERIFY V1
    // ============================================================
    const coordinatorPaymentVerifyMatch =
      url.pathname.match(/^\/api\/coordinator\/payments\/(\d+)\/verify$/)

    if (
      coordinatorPaymentVerifyMatch &&
      req.method === 'POST'
    ) {
      const auth = requireAuth(
        req,
        res,
        ['Super Admin','Main Coordinator','Department Coordinator']
      )
      if (!auth) return

      const paymentId = Number(coordinatorPaymentVerifyMatch[1])

      const payment = db.prepare(`
        SELECT *
        FROM payments
        WHERE id=?
      `).get(paymentId)

      if (!payment) {
        return json(res,404,{
          ok:false,
          error:'Payment record not found.'
        })
      }

      const event = db.prepare(`
        SELECT *
        FROM events
        WHERE id=?
      `).get(payment.event_id)

      if (!event) {
        return json(res,404,{
          ok:false,
          error:'Event not found.'
        })
      }

      if (!canCoordinateEvent(auth.user,event)) {
        return json(res,403,{
          ok:false,
          error:'You do not manage this event.'
        })
      }

      if (payment.status !== 'Pending') {
        return json(res,409,{
          ok:false,
          error:`This payment is already ${payment.status}.`
        })
      }

      if (!payment.registration_id) {
        return json(res,409,{
          ok:false,
          error:'This payment is not linked to a registration.'
        })
      }

      const registration = db.prepare(`
        SELECT *
        FROM registrations
        WHERE id=?
      `).get(payment.registration_id)

      if (!registration) {
        return json(res,404,{
          ok:false,
          error:'Registration not found.'
        })
      }

      if (Number(registration.event_id) !== Number(payment.event_id)) {
        return json(res,409,{
          ok:false,
          error:'Payment and registration do not belong to the same event.'
        })
      }

      if (['Rejected','Cancelled','Waiting List'].includes(registration.status)) {
        return json(res,409,{
          ok:false,
          error:`Cannot verify payment for a ${registration.status} registration.`
        })
      }

      const body = await parseBody(req)

      const method = clean(body.method)
      const reference = clean(body.reference)
      const receipt = clean(body.receipt_no)
      const notes = clean(body.notes)

      if (!['Cash','Coordinator UPI'].includes(method)) {
        return json(res,400,{
          ok:false,
          error:'Choose Cash or Coordinator UPI.'
        })
      }

      if (method === 'Coordinator UPI' && !reference) {
        return json(res,400,{
          ok:false,
          error:'UPI transaction/reference ID is required.'
        })
      }

      if (receipt) {
        const duplicateReceipt = db.prepare(`
          SELECT id
          FROM payments
          WHERE receipt_no=?
            AND id<>?
          LIMIT 1
        `).get(receipt,payment.id)

        if (duplicateReceipt) {
          return json(res,409,{
            ok:false,
            error:'This receipt number is already in use.'
          })
        }
      }

      db.exec('BEGIN')

      try {
        db.prepare(`
          UPDATE payments
          SET
            method=?,
            provider_reference=?,
            receipt_no=?,
            status='Paid',
            collected_by=?,
            notes=?,
            updated_at=CURRENT_TIMESTAMP
          WHERE id=?
            AND status='Pending'
        `).run(
          method,
          reference || null,
          receipt || null,
          auth.user.id,
          notes || null,
          payment.id
        )

        db.prepare(`
          UPDATE registrations
          SET
            status='Confirmed',
            updated_at=CURRENT_TIMESTAMP
          WHERE id=?
        `).run(registration.id)

        db.prepare(`
          INSERT INTO system_audit(
            user_id,
            action,
            entity_type,
            entity_id,
            details
          )
          VALUES (?,?,?,?,?)
        `).run(
          auth.user.id,
          'Offline payment verified',
          'Payment',
          String(payment.id),
          JSON.stringify({
            event_id:payment.event_id,
            registration_id:payment.registration_id,
            amount:payment.amount,
            method,
            reference:reference || null,
            receipt_no:receipt || null
          })
        )

        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }

      registrationStudentIds(registration).forEach(studentId => {
        notifyStudent(
          studentId,
          'Payment verified',
          `Your payment for ${event.name} has been verified. Your registration is confirmed.`,
          'Payment',
          `/student/payments`,
          registration.id
        )
      })

      const updated = db.prepare(`
        SELECT
          p.*,
          u.name AS collector_name
        FROM payments p
        LEFT JOIN users u
          ON u.id=p.collected_by
        WHERE p.id=?
      `).get(payment.id)

      return json(res,200,{
        ok:true,
        message:'Payment verified successfully.',
        payment:updated,
        registration_status:'Confirmed'
      })
    }

    if (
      req.method === 'GET' &&
      url.pathname === '/api/coordinator/reports/payments'
    ) {
      const auth = requireAuth(
        req,
        res,
        ['Super Admin','HOD','Main Coordinator','Department Coordinator']
      )
      if (!auth) return

      const eventId = Number(url.searchParams.get('event_id') || 0)

      if (!eventId) {
        return json(res,400,{
          ok:false,
          error:'event_id is required.'
        })
      }

      const event = db.prepare(
        'SELECT * FROM events WHERE id=?'
      ).get(eventId)

      if (!event) {
        return json(res,404,{
          ok:false,
          error:'Event not found.'
        })
      }

      if (!canReadEvent(auth.user,event)) {
        return json(res,403,{
          ok:false,
          error:'You do not manage this event.'
        })
      }

      /*
       * Reconciliation uses the latest payment record for each
       * registration. This prevents an older failed/voided attempt
       * from being counted together with the current payment.
       */
      const payments = db.prepare(`
        SELECT
          p.*,
          r.registration_type,
          r.status AS registration_status,
          r.source AS registration_source,
          r.created_at AS registration_created_at,
          u.name AS collector_name
        FROM payments p
        LEFT JOIN registrations r
          ON r.id=p.registration_id
        LEFT JOIN users u
          ON u.id=p.collected_by
        WHERE p.event_id=?
          AND p.id=(
            SELECT p2.id
            FROM payments p2
            WHERE
              p2.event_id=p.event_id
              AND (
                p2.registration_id=p.registration_id
                OR (
                  p.registration_id IS NULL
                  AND p2.registration_id IS NULL
                  AND p2.id=p.id
                )
              )
            ORDER BY p2.id DESC
            LIMIT 1
          )
        ORDER BY p.created_at DESC,p.id DESC
      `).all(eventId)

      const rows = payments.map(payment => {
        let subject = null

        if (payment.registration_id) {
          const registration = db.prepare(
            'SELECT * FROM registrations WHERE id=?'
          ).get(payment.registration_id)

          if (registration) {
            if (registration.registration_type === 'Individual') {
              subject = getStudentById(registration.student_id)
            } else if (registration.team_id) {
              subject = teamPayload(
                getTeam(registration.team_id)
              )
            }
          }
        }

        return {
          ...payment,
          subject
        }
      })

      const money = value =>
        Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100

      const paidRows = rows.filter(row => row.status === 'Paid')
      const pendingRows = rows.filter(row => row.status === 'Pending')
      const failedRows = rows.filter(row => row.status === 'Failed')
      const refundedRows = rows.filter(row => row.status === 'Refunded')
      const voidedRows = rows.filter(row => row.status === 'Voided')

      const paidTotal = money(
        paidRows.reduce(
          (sum,row) => sum + Number(row.amount || 0),
          0
        )
      )

      const pendingTotal = money(
        pendingRows.reduce(
          (sum,row) => sum + Number(row.amount || 0),
          0
        )
      )

      const methodTotals = {}

      for (const row of paidRows) {
        const method = row.method || 'Other'

        if (!methodTotals[method]) {
          methodTotals[method] = {
            count:0,
            amount:0
          }
        }

        methodTotals[method].count += 1
        methodTotals[method].amount = money(
          methodTotals[method].amount +
          Number(row.amount || 0)
        )
      }

      return json(res,200,{
        ok:true,
        event:parseEventRow(event),
        rows,
        summary:{
          records:rows.length,
          paid_count:paidRows.length,
          paid_total:paidTotal,
          pending_count:pendingRows.length,
          pending_total:pendingTotal,
          failed_count:failedRows.length,
          refunded_count:refundedRows.length,
          voided_count:voidedRows.length,
          method_totals:methodTotals
        }
      })
    }
    if (req.method === 'GET' && url.pathname === '/api/registrations/manage') {
      const auth=requireAuth(req,res,['Super Admin','HOD','Main Coordinator','Department Coordinator']); if(!auth)return
      const eventId=Number(url.searchParams.get('event_id')||0); if(!eventId)return json(res,400,{ok:false,error:'Event is required.'})
      const event=db.prepare('SELECT * FROM events WHERE id=?').get(eventId); if(!event)return json(res,404,{ok:false,error:'Event not found.'}); if(!canReadEvent(auth.user,event))return json(res,403,{ok:false,error:'You do not manage this event.'})
      const status=clean(url.searchParams.get('status')); const q=clean(url.searchParams.get('q')); const cond=['r.event_id=?']; const params=[eventId]
      if(status){cond.push('r.status=?');params.push(status)}
      if(q){cond.push('(s.name LIKE ? OR s.student_id LIKE ? OR t.team_name LIKE ? OR t.team_code LIKE ?)');const term=`%${q}%`;params.push(term,term,term,term)}
      const rows=db.prepare(`SELECT r.id FROM registrations r LEFT JOIN students s ON s.student_id=r.student_id LEFT JOIN teams t ON t.id=r.team_id WHERE ${cond.join(' AND ')} ORDER BY CASE r.status WHEN 'Waiting List' THEN 2 ELSE 1 END,r.created_at DESC`).all(...params)
      const summary=db.prepare("SELECT status,COUNT(*) AS count FROM registrations WHERE event_id=? AND status!='Cancelled' GROUP BY status").all(eventId)
      return json(res,200,{rows:rows.map(r=>registrationPayload(db.prepare('SELECT * FROM registrations WHERE id=?').get(r.id))),summary,seats_used:registrationSeatCount(eventId),capacity:event.capacity||null})
    }

    if (req.method === 'POST' && url.pathname === '/api/registrations') {
      const auth=requireAuth(req,res,['Student','Super Admin','Main Coordinator','Department Coordinator']); if(!auth)return
      const body=await parseBody(req); const event=db.prepare('SELECT * FROM events WHERE id=?').get(Number(body.event_id)); if(!event)return json(res,404,{ok:false,error:'Event not found.'})
      const isStudent=auth.user.role==='Student'; if(isStudent&&!registrationWindowOpen(event))return json(res,409,{ok:false,error:'Registration is not currently open for this event.'}); if(!isStudent&&!canCoordinateEvent(auth.user,event))return json(res,403,{ok:false,error:'You do not manage this event.'})
      const type=clean(body.registration_type)||'Individual'; if(!['Individual','Team'].includes(type))return json(res,400,{ok:false,error:'Choose Individual or Team registration.'})
      if(type==='Individual'&&event.participation_type==='Team')return json(res,409,{ok:false,error:'This event only accepts team registrations.'}); if(type==='Team'&&event.participation_type==='Individual')return json(res,409,{ok:false,error:'This event only accepts individual registrations.'})
      let studentId=null,teamId=null
      if(type==='Individual'){studentId=isStudent?auth.user.student_id:clean(body.student_id);const student=getStudentById(studentId);const errs=validateStudentForEvent(student,event);if(errs.length)return json(res,400,{ok:false,error:errs[0],errors:errs})}
      else {teamId=Number(body.team_id||0);const team=getTeam(teamId);if(!team||team.event_id!==event.id)return json(res,400,{ok:false,error:'Choose a team created for this event.'});if(team.status!=='Approved')return json(res,409,{ok:false,error:'The team must be approved before event registration.'});if(isStudent && team.leader_student_id!==auth.user.student_id)return json(res,403,{ok:false,error:'Only the team leader can register this team.'})}
      const needed=registrationCapacityNeeded(type,teamId)
      const capacityStatus=registrationStatusFor(event,needed)
      const status=capacityStatus==='Waiting List'
        ? 'Waiting List'
        : Boolean(event.registration_approval_required)
          ? 'Waiting for Approval'
          : event.payment_type==='Paid'
            ? 'Payment Pending'
            : 'Confirmed'
      try{
        db.exec('BEGIN')
        const result=db.prepare('INSERT INTO registrations(event_id,registration_type,student_id,team_id,status,source,created_by_user_id) VALUES (?,?,?,?,?,?,?)').run(event.id,type,studentId,teamId,status,isStudent?'Self':'Coordinator',auth.user.id)
        const id=Number(result.lastInsertRowid)
        if(status==='Waiting List') db.prepare('INSERT INTO waiting_list(event_id,registration_id,position) VALUES (?,?,?)').run(event.id,id,nextWaitingPosition(event.id))
        if(status==='Payment Pending') ensurePaymentForRegistration(id)
        db.exec('COMMIT')
        const createdRegistration=db.prepare('SELECT * FROM registrations WHERE id=?').get(id)
        const studentIds=registrationStudentIds(createdRegistration)
        const title=status==='Waiting for Approval'?'Registration awaiting approval':status==='Payment Pending'?'Registration created — payment pending':status==='Confirmed'?'Registration confirmed':'Waiting list registration'
        const message=status==='Waiting for Approval'?`${event.name}: your registration was submitted and is waiting for coordinator approval.`:status==='Payment Pending'?`${event.name}: your registration is accepted. Complete payment from the Payments page.`:status==='Confirmed'?`${event.name}: your registration is confirmed. No further approval is required.`:`${event.name}: you are on the waiting list. Payment is not required until a seat is available.`
        studentIds.forEach(studentId=>notifyStudent(studentId,title,message))
        return json(res,201,{ok:true,registration:registrationPayload(createdRegistration)})
      } catch(e){
        try{db.exec('ROLLBACK')}catch{}
        if(String(e?.message||e).includes('UNIQUE'))return json(res,409,{ok:false,error:type==='Individual'?'This student is already registered for the event.':'This team is already registered for the event.'})
        throw e
      }
    }


    // V3.5 — participant registration approval.
    const registrationApprovalMatch=url.pathname.match(/^\/api\/registrations\/(\d+)\/approval$/)
    if(registrationApprovalMatch&&req.method==='POST'){
      const auth=requireAuth(req,res,['Super Admin','Main Coordinator','Department Coordinator']);if(!auth)return

      const id=Number(registrationApprovalMatch[1])
      const reg=db.prepare('SELECT * FROM registrations WHERE id=?').get(id)
      if(!reg)return json(res,404,{ok:false,error:'Registration not found.'})

      const event=db.prepare('SELECT * FROM events WHERE id=?').get(reg.event_id)
      if(!event)return json(res,404,{ok:false,error:'Event not found.'})

      let allowed=false

      if(auth.user.role==='Super Admin'){
        allowed=true
      } else if(auth.user.role==='Main Coordinator'){
        allowed=event.created_by===auth.user.id || event.main_coordinator_id===auth.user.id
      } else if(auth.user.role==='Librarian'){
        allowed=canCoordinateEvent(auth.user,event)
      } else if(auth.user.role==='Department Coordinator'){
        if(reg.registration_type==='Individual'){
          const student=getStudentById(reg.student_id)
          allowed=!!student && student.department===auth.user.department
        } else if(reg.team_id){
          const memberDepartments=db.prepare(`
            SELECT DISTINCT s.department
            FROM team_members tm
            JOIN students s ON s.student_id=tm.student_id
            WHERE tm.team_id=?
          `).all(reg.team_id).map(x=>x.department)

          allowed=memberDepartments.includes(auth.user.department)
        }
      }

      if(!allowed)return json(res,403,{ok:false,error:'You do not have permission to approve this registration.'})

      if(reg.status!=='Waiting for Approval'){
        return json(res,409,{ok:false,error:'Only registrations waiting for approval can be reviewed.'})
      }

      const body=await parseBody(req)
      const action=clean(body.action)

      if(!['approve','reject'].includes(action)){
        return json(res,400,{ok:false,error:'Choose Approve or Reject.'})
      }

      let next='Rejected'
      if(action==='approve') next=event.payment_type==='Paid'?'Payment Pending':'Confirmed'

      db.prepare("UPDATE registrations SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
        .run(next,id)
      if(next==='Payment Pending') ensurePaymentForRegistration(id)
      registrationStudentIds(reg).forEach(studentId=>notifyStudent(studentId,next==='Confirmed'?'Registration approved':next==='Payment Pending'?'Registration approved - payment pending':'Registration rejected',next==='Payment Pending'?`${event.name}: your registration has been approved. Please complete payment from the Payments page.`:`${event.name}: your registration is now ${next}.`))
      if(next==='Rejected') promoteWaitingList(reg.event_id)

      return json(res,200,{
        ok:true,
        registration:registrationPayload(
          db.prepare('SELECT * FROM registrations WHERE id=?').get(id)
        )
      })
    }

    const cancelRegistrationMatch=url.pathname.match(/^\/api\/registrations\/(\d+)\/cancel$/)
    if(cancelRegistrationMatch&&req.method==='POST'){
      const auth=requireAuth(req,res,['Student','Super Admin','Main Coordinator','Department Coordinator']);if(!auth)return
      const reg=db.prepare('SELECT * FROM registrations WHERE id=?').get(Number(cancelRegistrationMatch[1]));if(!reg)return json(res,404,{ok:false,error:'Registration not found.'});const event=db.prepare('SELECT * FROM events WHERE id=?').get(reg.event_id)
      let allowed=false;if(auth.user.role==='Student'){if(reg.student_id===auth.user.student_id)allowed=true;if(reg.team_id&&db.prepare('SELECT 1 FROM teams WHERE id=? AND leader_student_id=?').get(reg.team_id,auth.user.student_id))allowed=true}else allowed=canCoordinateTeamEvent(auth.user,event)
      if(!allowed)return json(res,403,{ok:false,error:'You cannot cancel this registration.'});if(reg.status==='Cancelled')return json(res,409,{ok:false,error:'Registration is already cancelled.'})
      db.prepare("UPDATE registrations SET status='Cancelled',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(reg.id);db.prepare('DELETE FROM waiting_list WHERE registration_id=?').run(reg.id);db.prepare("UPDATE payments SET status='Voided',updated_at=CURRENT_TIMESTAMP WHERE registration_id=? AND status='Pending'").run(reg.id);promoteWaitingList(reg.event_id)
      return json(res,200,{ok:true})
    }


    // V3.2 — Individual/Team competition and team management.
    if (req.method === 'GET' && url.pathname === '/api/team-events') {
      const auth = requireAuth(req, res, ['Student','Super Admin','Main Coordinator','Department Coordinator'])
      if (!auth) return
      let rows = db.prepare(`SELECT * FROM events WHERE status IN ('Published','Registration Open') ORDER BY date(event_date),start_time`).all()
        .map(parseEventRow).filter(eventSupportsTeams)
      if (auth.user.role === 'Student') {
        const student = auth.user.student_id ? getStudentById(auth.user.student_id) : null
        if (!student) return json(res, 409, { ok:false, error:'Your account is not linked to a Student Directory record.' })
        rows = rows.filter((e) => validateStudentForEvent(student, e).length === 0)
      } else if (
        auth.user.role === 'Department Coordinator' ||
        ['Main Coordinator','Librarian'].includes(auth.user.role)
      ) {
        rows = rows.filter((e) => canCoordinateTeamEvent(auth.user, e))
      }
      return json(res, 200, { rows })
    }

    if (req.method === 'GET' && url.pathname === '/api/teams/my') {
      const auth = requireAuth(req, res, ['Student'])
      if (!auth) return
      if (!auth.user.student_id) return json(res, 409, { ok:false, error:'Your account is not linked to a Student Directory record.' })
      const rows = db.prepare(`SELECT DISTINCT t.id FROM teams t JOIN team_members tm ON tm.team_id=t.id WHERE tm.student_id=? ORDER BY t.created_at DESC`).all(auth.user.student_id)
      const invitations = db.prepare(`SELECT t.id,t.team_name,t.team_code,e.name AS event_name,tm.status,s.name AS leader_name
        FROM team_members tm JOIN teams t ON t.id=tm.team_id JOIN events e ON e.id=t.event_id JOIN students s ON s.student_id=t.leader_student_id
        WHERE tm.student_id=? AND tm.status='Pending' AND tm.role='Member' ORDER BY t.created_at DESC`).all(auth.user.student_id)
      return json(res, 200, { rows: rows.map((r)=>teamPayload(getTeam(r.id))), invitations })
    }

    if (req.method === 'GET' && url.pathname === '/api/teams/manage') {
      const auth = requireAuth(req, res, ['Super Admin','Main Coordinator','Department Coordinator'])
      if (!auth) return
      const eventId = Number(url.searchParams.get('event_id') || 0)
      const status = clean(url.searchParams.get('status'))
      const q = clean(url.searchParams.get('q'))
      const conditions = [], params = []
      if (eventId) { conditions.push('t.event_id=?'); params.push(eventId) }
      if (status) { conditions.push('t.status=?'); params.push(status) }
      if (q) { conditions.push('(t.team_name LIKE ? OR t.team_code LIKE ? OR s.name LIKE ? OR t.leader_student_id LIKE ?)'); const term=`%${q}%`; params.push(term,term,term,term) }
      if (auth.user.role === 'Librarian') {
        conditions.push("e.event_scope='Library' AND (e.created_by=? OR e.main_coordinator_id=?)")
        params.push(auth.user.id, auth.user.id)
      } else if (auth.user.role !== 'Super Admin') {
        conditions.push(`(
          e.event_scope='College'
          OR e.category='College Event'
          OR e.organizing_department='Administration'
          OR (
            ?='Department Coordinator'
            AND e.organizing_department=?
          )
          OR (
            ?='Main Coordinator'
            AND (e.created_by=? OR e.main_coordinator_id=?)
          )
        )`)
        params.push(
          auth.user.role,
          auth.user.department,
          auth.user.role,
          auth.user.id,
          auth.user.id
        )
      }
      const clause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
      const ids = db.prepare(`SELECT t.id FROM teams t JOIN events e ON e.id=t.event_id JOIN students s ON s.student_id=t.leader_student_id ${clause} ORDER BY t.created_at DESC`).all(...params)
      return json(res, 200, { rows: ids.map((r)=>teamPayload(getTeam(r.id))) })
    }

    if (req.method === 'POST' && url.pathname === '/api/teams') {
      const auth = requireAuth(req, res, ['Student','Super Admin','Main Coordinator','Department Coordinator'])
      if (!auth) return
      const body = await parseBody(req)
      const event = db.prepare('SELECT * FROM events WHERE id=?').get(Number(body.event_id))
      if (!event) return json(res,404,{ok:false,error:'Event not found.'})
      if (!eventSupportsTeams(event)) return json(res,409,{ok:false,error:'This event is not configured for team participation.'})
      if (!['Published','Registration Open'].includes(event.status) && auth.user.role==='Student') return json(res,409,{ok:false,error:'Team registration is not open for this event.'})
      const isStudent = auth.user.role === 'Student'
      if (isStudent) {
        return json(res,403,{
          ok:false,
          error:'Teams are created by the event coordinator. Register individually first; the coordinator will assign a team leader.'
        })
      }

      if (!Boolean(event.allow_coordinator_teams)) {
        return json(res,403,{
          ok:false,
          error:'Coordinator-created teams are disabled for this event.'
        })
      }

      if (!canCoordinateTeamEvent(auth.user,event)) {
        return json(res,403,{
          ok:false,
          error:'You do not have permission to create teams for this event.'
        })
      }

      const leaderId = clean(body.leader_student_id)
      if (!leaderId) return json(res,400,{ok:false,error:'Select a team leader.'})
      const leader = getStudentById(leaderId)
      const eligibility = validateStudentForEvent(leader,event)

      if (eligibility.length) {
        return json(res,400,{
          ok:false,
          error:eligibility[0],
          errors:eligibility
        })
      }

      if (event.participation_type !== 'Team' && !hasActiveIndividualRegistration(event.id, leaderId)) {
        return json(res,409,{
          ok:false,
          error:`${leader.name} must register individually for this event before being assigned as team leader.`
        })
      }

      if (Boolean(event.one_team_per_student)) {
        const existing = studentAlreadyInEventTeam(event.id,leaderId)
        if (existing) return json(res,409,{ok:false,error:`This student is already in ${existing.team_name} for this event.`})
      }
      const teamName = clean(body.team_name) || (Boolean(event.team_name_required) ? '' : `${leader.name}'s Team`)
      if (!teamName) return json(res,400,{ok:false,error:'Team name is required.'})
      const result = db.prepare('INSERT INTO teams(event_id,team_name,team_code,leader_student_id,created_by_user_id) VALUES (?,?,?,?,?)').run(event.id,teamName,teamCode(),leaderId,auth.user.id)
      const teamId = Number(result.lastInsertRowid)
      db.prepare("INSERT INTO team_members(team_id,student_id,role,status) VALUES (?,?,'Leader','Verified')").run(teamId,leaderId)
      const memberIds = Array.isArray(body.member_student_ids) ? body.member_student_ids.map(clean).filter(Boolean) : []
      for (const sid of memberIds) {
        if (sid === leaderId) continue
        const member = getStudentById(sid)
        const errs=validateStudentForEvent(member,event)

        if (errs.length) continue

        if (event.participation_type !== 'Team' && !hasActiveIndividualRegistration(event.id,sid)) continue

        if (
          Boolean(event.one_team_per_student) &&
          studentAlreadyInEventTeam(event.id,sid)
        ) continue
        if (teamMembers(teamId).length >= Number(event.team_max || 999)) break
        db.prepare("INSERT OR IGNORE INTO team_members(team_id,student_id,role,status) VALUES (?,?,'Member',?)").run(teamId,sid,isStudent && Boolean(event.member_approval_required)?'Pending':'Verified')
      }
      auditTeam(teamId,'Team Created',isStudent?'Created by student leader':'Created with coordinator assistance',auth.user.id)
      return json(res,201,{ok:true,team:teamPayload(getTeam(teamId))})
    }

    const teamMatch = url.pathname.match(/^\/api\/teams\/(\d+)$/)
    if (teamMatch && req.method === 'GET') {
      const auth = requireAuth(req,res,['Student','Super Admin','Main Coordinator','Department Coordinator']); if(!auth) return
      const team=getTeam(Number(teamMatch[1])); if(!team) return json(res,404,{ok:false,error:'Team not found.'})
      if(auth.user.role==='Student') {
        const member=db.prepare('SELECT 1 FROM team_members WHERE team_id=? AND student_id=?').get(team.id,auth.user.student_id)
        if(!member) return json(res,403,{ok:false,error:'This team is not part of your account.'})
      } else if(!canCoordinateTeamEvent(auth.user,db.prepare('SELECT * FROM events WHERE id=?').get(team.event_id))) return json(res,403,{ok:false,error:'You do not manage this event.'})
      return json(res,200,{team:teamPayload(team)})
    }

    const addMemberMatch=url.pathname.match(/^\/api\/teams\/(\d+)\/members$/)
    if(addMemberMatch && req.method==='POST') {
      const auth=requireAuth(req,res,['Student','Super Admin','Main Coordinator','Department Coordinator']); if(!auth) return
      const team=getTeam(Number(addMemberMatch[1])); if(!team) return json(res,404,{ok:false,error:'Team not found.'})
      const event=db.prepare('SELECT * FROM events WHERE id=?').get(team.event_id)
      const isLeader=canStudentManageTeam(auth.user,team), isCoord=!['Student'].includes(auth.user.role)&&canCoordinateTeamEvent(auth.user,event)
      if(!isLeader&&!isCoord) return json(res,403,{ok:false,error:'You cannot change this team.'})
      if(['Approved','Locked','Rejected'].includes(team.status)) return json(res,409,{ok:false,error:'This team is locked for member changes.'})
      if(teamMembers(team.id).length>=Number(event.team_max||999)) return json(res,409,{ok:false,error:`Maximum team size is ${event.team_max}.`})
      const body=await parseBody(req); const sid=clean(body.student_id); const student=getStudentById(sid)
      const errs=validateStudentForEvent(student,event)

      if(errs.length) {
        return json(res,400,{
          ok:false,
          error:errs[0],
          errors:errs
        })
      }

      if (event.participation_type !== 'Team' && !hasActiveIndividualRegistration(event.id,sid)) {
        return json(res,409,{
          ok:false,
          error:`${student.name} has not registered individually for this event. Only registered students can be added to a team.`
        })
      }

      if(Boolean(event.one_team_per_student)) {
        const existing=studentAlreadyInEventTeam(event.id,sid,team.id)

        if(existing) {
          return json(res,409,{
            ok:false,
            error:`This student is already in ${existing.team_name} for this event and cannot join another team.`
          })
        }
      }
      try { db.prepare("INSERT INTO team_members(team_id,student_id,role,status) VALUES (?,?,'Member',?)").run(team.id,sid,isLeader&&Boolean(event.member_approval_required)?'Pending':'Verified') }
      catch(e){ if(String(e?.message||e).includes('UNIQUE')) return json(res,409,{ok:false,error:'This student is already in the team.'}); throw e }
      auditTeam(team.id,'Member Added',`${sid} added`,auth.user.id)
      return json(res,200,{ok:true,team:teamPayload(getTeam(team.id))})
    }

    const memberActionMatch=url.pathname.match(/^\/api\/teams\/(\d+)\/members\/([^/]+)\/respond$/)
    if(memberActionMatch && req.method==='POST') {
      const auth=requireAuth(req,res,['Student']); if(!auth) return
      const team=getTeam(Number(memberActionMatch[1])); if(!team) return json(res,404,{ok:false,error:'Team not found.'})
      const sid=decodeURIComponent(memberActionMatch[2]); if(auth.user.student_id!==sid) return json(res,403,{ok:false,error:'You can only respond to your own invitation.'})
      const membership=db.prepare('SELECT * FROM team_members WHERE team_id=? AND student_id=?').get(team.id,sid); if(!membership||membership.status!=='Pending') return json(res,409,{ok:false,error:'No pending invitation was found.'})
      const body=await parseBody(req); const action=clean(body.action)
      if(action==='accept') db.prepare("UPDATE team_members SET status='Accepted',updated_at=CURRENT_TIMESTAMP WHERE team_id=? AND student_id=?").run(team.id,sid)
      else if(action==='decline') db.prepare("UPDATE team_members SET status='Declined',updated_at=CURRENT_TIMESTAMP WHERE team_id=? AND student_id=?").run(team.id,sid)
      else return json(res,400,{ok:false,error:'Choose accept or decline.'})
      auditTeam(team.id,action==='accept'?'Invitation Accepted':'Invitation Declined',sid,auth.user.id)
      return json(res,200,{ok:true})
    }

    const removeMemberMatch=url.pathname.match(/^\/api\/teams\/(\d+)\/members\/([^/]+)$/)
    if(removeMemberMatch && req.method==='DELETE') {
      const auth=requireAuth(req,res,['Student','Super Admin','Main Coordinator','Department Coordinator']); if(!auth) return
      const team=getTeam(Number(removeMemberMatch[1])); if(!team) return json(res,404,{ok:false,error:'Team not found.'})
      const event=db.prepare('SELECT * FROM events WHERE id=?').get(team.event_id); const sid=decodeURIComponent(removeMemberMatch[2])
      const isLeader=canStudentManageTeam(auth.user,team),isCoord=auth.user.role!=='Student'&&canCoordinateTeamEvent(auth.user,event)
      if(!isLeader&&!isCoord) return json(res,403,{ok:false,error:'You cannot change this team.'})
      if(sid===team.leader_student_id) return json(res,409,{ok:false,error:'Change the team leader before removing the current leader.'})
      if(['Approved','Locked'].includes(team.status)&&!Boolean(event.allow_member_replacement)) return json(res,409,{ok:false,error:'Member replacement is disabled after approval.'})
      db.prepare('DELETE FROM team_members WHERE team_id=? AND student_id=?').run(team.id,sid); auditTeam(team.id,'Member Removed',sid,auth.user.id)
      return json(res,200,{ok:true,team:teamPayload(getTeam(team.id))})
    }

    const submitTeamMatch=url.pathname.match(/^\/api\/teams\/(\d+)\/submit$/)
    if(submitTeamMatch&&req.method==='POST') {
      const auth=requireAuth(req,res,['Student','Super Admin','Main Coordinator','Department Coordinator']); if(!auth) return
      const team=getTeam(Number(submitTeamMatch[1])); if(!team)return json(res,404,{ok:false,error:'Team not found.'})
      const event=db.prepare('SELECT * FROM events WHERE id=?').get(team.event_id); const isLeader=canStudentManageTeam(auth.user,team),isCoord=auth.user.role!=='Student'&&canCoordinateTeamEvent(auth.user,event)
      if(!isLeader&&!isCoord)return json(res,403,{ok:false,error:'You cannot submit this team.'})
      const members=teamMembers(team.id).filter(m=>m.status!=='Declined')
      if(members.length<Number(event.team_min||2)||members.length>Number(event.team_max||999)) return json(res,409,{ok:false,error:`Team must have ${event.team_min}–${event.team_max} members.`})
      if(Boolean(event.member_approval_required)&&members.some(m=>!['Accepted','Verified'].includes(m.status))) return json(res,409,{ok:false,error:'All invited members must accept before the team can be submitted.'})
      const next=Boolean(event.coordinator_team_approval_required)?'Pending':'Approved'
      db.prepare('UPDATE teams SET status=?,review_comment=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(next,team.id); auditTeam(team.id,next==='Pending'?'Submitted for Approval':'Team Auto-Approved',null,auth.user.id)
      return json(res,200,{ok:true,team:teamPayload(getTeam(team.id))})
    }

    const reviewTeamMatch=url.pathname.match(/^\/api\/teams\/(\d+)\/review$/)
    if(reviewTeamMatch&&req.method==='POST') {
      const auth=requireAuth(req,res,['Super Admin','Main Coordinator','Department Coordinator']); if(!auth)return
      const team=getTeam(Number(reviewTeamMatch[1])); if(!team)return json(res,404,{ok:false,error:'Team not found.'})
      const event=db.prepare('SELECT * FROM events WHERE id=?').get(team.event_id); if(!canCoordinateTeamEvent(auth.user,event))return json(res,403,{ok:false,error:'You do not manage this event.'})
      if(team.status!=='Pending'&&team.status!=='Changes Requested')return json(res,409,{ok:false,error:'Only pending teams can be reviewed.'})
      const body=await parseBody(req); const action=clean(body.action),comment=clean(body.comment)||null; const map={approve:'Approved',changes:'Changes Requested',reject:'Rejected'}; const next=map[action]
      if(!next)return json(res,400,{ok:false,error:'Choose Approve, Request Changes or Reject.'}); if((action==='changes'||action==='reject')&&!comment)return json(res,400,{ok:false,error:'Add a comment for changes or rejection.'})
      db.prepare('UPDATE teams SET status=?,review_comment=?,approved_by=?,approved_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(next,comment,action==='approve'?auth.user.id:null,action==='approve'?new Date().toISOString():null,team.id); auditTeam(team.id,next,comment,auth.user.id)
      return json(res,200,{ok:true,team:teamPayload(getTeam(team.id))})
    }

    const leaderMatch=url.pathname.match(/^\/api\/teams\/(\d+)\/leader$/)
    if(leaderMatch&&req.method==='PATCH') {
      const auth=requireAuth(req,res,['Super Admin','Main Coordinator','Department Coordinator']); if(!auth)return
      const team=getTeam(Number(leaderMatch[1])); if(!team)return json(res,404,{ok:false,error:'Team not found.'}); const event=db.prepare('SELECT * FROM events WHERE id=?').get(team.event_id); if(!canCoordinateTeamEvent(auth.user,event))return json(res,403,{ok:false,error:'You do not manage this event.'})
      const body=await parseBody(req); const sid=clean(body.student_id),member=db.prepare('SELECT * FROM team_members WHERE team_id=? AND student_id=?').get(team.id,sid); if(!member)return json(res,409,{ok:false,error:'The new leader must already be a team member.'})
      db.exec('BEGIN'); try { db.prepare("UPDATE team_members SET role='Member' WHERE team_id=?").run(team.id); db.prepare("UPDATE team_members SET role='Leader',status='Verified' WHERE team_id=? AND student_id=?").run(team.id,sid); db.prepare('UPDATE teams SET leader_student_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(sid,team.id); db.exec('COMMIT') } catch(e){db.exec('ROLLBACK');throw e}
      auditTeam(team.id,'Leader Changed',sid,auth.user.id); return json(res,200,{ok:true,team:teamPayload(getTeam(team.id))})
    }

    // Student data remains admin-managed in this phase.
    if (req.method === 'GET' && url.pathname === '/api/students/stats') {
      const auth = requireAuth(req, res, ['Super Admin','HOD','Main Coordinator','Department Coordinator'])
      if (!auth) return
      const total = db.prepare('SELECT COUNT(*) AS count FROM students').get().count
      const active = db.prepare("SELECT COUNT(*) AS count FROM students WHERE status = 'Active'").get().count
      const departments = db.prepare('SELECT department, COUNT(*) AS count FROM students GROUP BY department ORDER BY department').all()
      const years = db.prepare('SELECT year, COUNT(*) AS count FROM students GROUP BY year ORDER BY year').all()
      return json(res, 200, { total, active, departments, years })
    }

    if (req.method === 'GET' && url.pathname === '/api/students') {
      const auth = requireAuth(req, res, ['Super Admin','HOD','Main Coordinator','Department Coordinator'])
      if (!auth) return
      const q = clean(url.searchParams.get('q'))

      const eventId = Number(
        url.searchParams.get('event_id') || 0
      )

      let event = null

      if(eventId){
        event = db.prepare(
          'SELECT * FROM events WHERE id=?'
        ).get(eventId)

        if(!event){
          return json(res,404,{
            ok:false,
            error:'Event not found.'
          })
        }

        if(
          auth.user.role !== 'Super Admin' &&
          auth.user.role !== 'HOD' &&
          !canCoordinateEvent(auth.user,event)
        ){
          return json(res,403,{
            ok:false,
            error:'You do not have access to this event.'
          })
        }

        if(
          auth.user.role === 'HOD' &&
          event.organizing_department !==
            auth.user.department
        ){
          return json(res,403,{
            ok:false,
            error:'You do not have access to this event.'
          })
        }
      }

      let department = clean(
        url.searchParams.get('department')
      )
      if (
        !eventId &&
        (
          auth.user.role === 'Department Coordinator' ||
          auth.user.role === 'HOD'
        )
      ) {
        department = auth.user.department
      }
      const year = Number(url.searchParams.get('year') || 0)
      const status = clean(url.searchParams.get('status'))
      const page = Math.max(1, Number(url.searchParams.get('page') || 1))
      const limit = Math.min(100, Math.max(10, Number(url.searchParams.get('limit') || 25)))
      const offset = (page - 1) * limit
      const where = []
      const params = []
      if (q) {
        where.push('(student_id LIKE ? OR name LIKE ? OR roll_no LIKE ? OR barcode_value LIKE ?)')
        const term = `%${q}%`
        params.push(term, term, term, term)
      }
      if(eventId){
        where.push(`(
          EXISTS (
            SELECT 1
            FROM registrations r
            WHERE r.event_id=?
              AND r.student_id=students.student_id
              AND r.status NOT IN (
                'Cancelled',
                'Rejected'
              )
          )

          OR EXISTS (
            SELECT 1
            FROM teams t
            JOIN team_members tm
              ON tm.team_id=t.id
            WHERE t.event_id=?
              AND tm.student_id=students.student_id
              AND tm.status!='Declined'
          )
        )`)

        params.push(
          eventId,
          eventId
        )
      }

      if (department) { where.push('department = ?'); params.push(department) }
      if (year) { where.push('year = ?'); params.push(year) }
      if (status) { where.push('status = ?'); params.push(status) }
      const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
      const total = db.prepare(`SELECT COUNT(*) AS count FROM students ${clause}`).get(...params).count
      const rows = db.prepare(`SELECT * FROM students ${clause} ORDER BY name COLLATE NOCASE LIMIT ? OFFSET ?`).all(...params, limit, offset)
      return json(res, 200, { rows, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) })
    }

    if (req.method === 'POST' && url.pathname === '/api/students') {
      const auth = requireAuth(req, res, ['Super Admin'])
      if (!auth) return

      const body = await parseBody(req)
      const student = normalizeStudent(body)
      const errors = validateStudent(student)

      if (errors.length) {
        return json(res, 400, { ok: false, errors })
      }

      const createLogin =
        body.create_login === true ||
        body.createLogin === true

      const password = String(body.password || '')
      const confirmPassword = String(body.confirm_password || body.confirmPassword || '')

      if (createLogin) {
        if (!student.email) {
          return json(res, 400, {
            ok: false,
            error: 'Email is required when creating a student login account.'
          })
        }

        if (password.length < 10) {
          return json(res, 400, {
            ok: false,
            error: 'Student password must be at least 10 characters.'
          })
        }

        if (password !== confirmPassword) {
          return json(res, 400, {
            ok: false,
            error: 'Password and Confirm Password do not match.'
          })
        }
      }

      db.exec('BEGIN')

      try {
        db.prepare(`INSERT INTO students
          (student_id,name,department,year,semester,batch,roll_no,barcode_value,email,phone,status)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)`
        ).run(
          student.student_id,
          student.name,
          student.department,
          student.year,
          student.semester,
          student.batch,
          student.roll_no,
          student.barcode_value,
          student.email,
          student.phone,
          student.status
        )

        let loginUser = null

        if (createLogin) {
          const { hash, salt } = hashPassword(password)

          const result = db.prepare(`
            INSERT INTO users
            (
              name,
              email,
              college_id,
              role,
              department,
              student_id,
              password_hash,
              password_salt,
              active
            )
            VALUES (?,?,?,?,?,?,?,?,1)
          `).run(
            student.name,
            student.email.toLowerCase(),
            null,
            'Student',
            student.department,
            student.student_id,
            hash,
            salt
          )

          loginUser = publicUser(
            db.prepare('SELECT * FROM users WHERE id=?')
              .get(result.lastInsertRowid)
          )
        }

        db.exec('COMMIT')

        return json(res, 201, {
          ok: true,
          student: getStudentById(student.student_id),
          login_created: Boolean(loginUser),
          user: loginUser
        })

      } catch (error) {
        db.exec('ROLLBACK')

        const message = String(error?.message || error)

        if (message.includes('UNIQUE constraint failed')) {
          if (
            message.includes('users.email') ||
            message.includes('users.student_id')
          ) {
            return json(res, 409, {
              ok: false,
              error: 'A login account already exists with this email or Student ID.'
            })
          }

          return json(res, 409, {
            ok: false,
            error: 'Student ID, email account or barcode value already exists.'
          })
        }

        throw error
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/students/import') {
      const auth = requireAuth(req, res, ['Super Admin'])
      if (!auth) return
      const body = await parseBody(req)
      const rows = Array.isArray(body.rows) ? body.rows : []
      if (!rows.length) return json(res, 400, { ok: false, error: 'No student rows were provided.' })
      if (rows.length > 5000) return json(res, 400, { ok: false, error: 'Import is limited to 5,000 students at a time.' })
      const insert = db.prepare(`INSERT INTO students
        (student_id,name,department,year,semester,batch,roll_no,barcode_value,email,phone,status)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      const results = { imported: 0, duplicates: 0, invalid: 0, errors: [] }
      db.exec('BEGIN')
      try {
        rows.forEach((raw, index) => {
          const student = normalizeStudent(raw)
          const errors = validateStudent(student)
          if (errors.length) {
            results.invalid += 1
            results.errors.push({ row: index + 2, student_id: student.student_id, errors })
            return
          }
          try {
            insert.run(student.student_id, student.name, student.department, student.year, student.semester, student.batch, student.roll_no, student.barcode_value, student.email, student.phone, student.status)
            results.imported += 1
          } catch (error) {
            if (String(error?.message || error).includes('UNIQUE constraint failed')) {
              results.duplicates += 1
              results.errors.push({ row: index + 2, student_id: student.student_id, errors: ['Student ID or barcode value already exists'] })
            } else throw error
          }
        })
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
      return json(res, 200, { ok: true, ...results })
    }

    const studentMatch = url.pathname.match(/^\/api\/students\/([^/]+)$/)
    if (studentMatch && req.method === 'GET') {
      const auth = requireAuth(req, res, ['Super Admin','HOD','Main Coordinator','Department Coordinator','Student'])
      if (!auth) return

      const requestedStudentId = decodeURIComponent(studentMatch[1])

      // Students may read only their own Student Directory profile.
      if (
        auth.user.role === 'Student' &&
        auth.user.student_id !== requestedStudentId
      ) {
        return json(res, 403, {
          ok: false,
          error: 'You can only view your own student profile.'
        })
      }

      const student = getStudentById(requestedStudentId)
      if (!student) return json(res, 404, { ok: false, error: 'Student not found.' })
      if (['HOD','Department Coordinator'].includes(auth.user.role) && student.department !== auth.user.department) {
        return json(res, 403, { ok: false, error: 'You can only view students in your department.' })
      }
      return json(res, 200, { student })
    }

    if (studentMatch && req.method === 'DELETE') {
      const auth = requireAuth(req, res, ['Super Admin'])
      if (!auth) return

      const id = decodeURIComponent(studentMatch[1])
      const student = getStudentById(id)

      if (!student) {
        return json(res, 404, {
          ok: false,
          error: 'Student not found.'
        })
      }

      const registrationCount = Number(
        db.prepare(
          'SELECT COUNT(*) AS count FROM registrations WHERE student_id=?'
        ).get(id)?.count || 0
      )

      const teamCount = Number(
        db.prepare(
          'SELECT COUNT(*) AS count FROM team_members WHERE student_id=?'
        ).get(id)?.count || 0
      )

      const resultCount = Number(
        db.prepare(
          'SELECT COUNT(*) AS count FROM results WHERE student_id=?'
        ).get(id)?.count || 0
      )

      const certificateCount = Number(
        db.prepare(
          'SELECT COUNT(*) AS count FROM certificates WHERE student_id=?'
        ).get(id)?.count || 0
      )

      if (
        registrationCount ||
        teamCount ||
        resultCount ||
        certificateCount
      ) {
        return json(res, 409, {
          ok: false,
          error:
            'This student already has EventHub activity. Set the student to Inactive instead of deleting the record.',
          references: {
            registrations: registrationCount,
            teams: teamCount,
            results: resultCount,
            certificates: certificateCount
          }
        })
      }

      db.prepare('DELETE FROM students WHERE student_id=?').run(id)

      return json(res, 200, {
        ok: true,
        message: `${student.name} was deleted.`
      })
    }


    if (studentMatch && req.method === 'PATCH') {
      const auth = requireAuth(req, res, ['Super Admin'])
      if (!auth) return
      const id = decodeURIComponent(studentMatch[1])
      if (!getStudentById(id)) return json(res, 404, { ok: false, error: 'Student not found.' })
      const current = getStudentById(id)
      const input = await parseBody(req)
      const next = normalizeStudent({ ...current, ...input, student_id: id })
      const errors = validateStudent(next)
      if (errors.length) return json(res, 400, { ok: false, errors })
      db.prepare(`UPDATE students SET name=?,department=?,year=?,semester=?,batch=?,roll_no=?,barcode_value=?,email=?,phone=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE student_id=?`)
        .run(next.name, next.department, next.year, next.semester, next.batch, next.roll_no, next.barcode_value, next.email, next.phone, next.status, id)
      return json(res, 200, { ok: true, student: getStudentById(id) })
    }



    // =====================================================
    // GALLERY
    // =====================================================

    // Public gallery - published media only.
    if (req.method === 'GET' && url.pathname === '/api/gallery') {
      const rows = db.prepare(`
        SELECT
          g.id,
          g.event_id,
          g.type,
          g.title,
          g.url,
          g.published,
          g.created_at,
          e.name AS event_name,
          e.event_date,
          e.organizing_department
        FROM gallery_items g
        JOIN events e ON e.id = g.event_id
        WHERE g.published = 1
        ORDER BY g.created_at DESC
      `).all().map(row => ({
        ...row,
        published: Boolean(row.published)
      }))

      return json(res, 200, {
        ok: true,
        rows
      })
    }

    // Super Admin gallery management data.
    if (req.method === 'GET' && url.pathname === '/api/admin/gallery') {
      const auth = requireAuth(req, res, ['Super Admin'])
      if (!auth) return

      const rows = db.prepare(`
        SELECT
          g.*,
          e.name AS event_name,
          e.event_date,
          e.organizing_department
        FROM gallery_items g
        JOIN events e ON e.id = g.event_id
        ORDER BY g.created_at DESC
      `).all().map(row => ({
        ...row,
        published: Boolean(row.published)
      }))

      const events = db.prepare(`
        SELECT
          id,
          event_code,
          name,
          event_date,
          organizing_department,
          status
        FROM events
        ORDER BY date(event_date) DESC, name COLLATE NOCASE
      `).all()

      return json(res, 200, {
        ok: true,
        rows,
        events
      })
    }

    // Create gallery item.
    if (req.method === 'POST' && url.pathname === '/api/admin/gallery') {
      const auth = requireAuth(req, res, ['Super Admin'])
      if (!auth) return

      const body = await parseBody(req)

      const eventId = Number(body.event_id)
      const type = clean(body.type) || 'Photo'
      const title = clean(body.title)
      const mediaUrl = clean(body.url)
      const published = body.published ? 1 : 0

      if (!eventId || !title || !mediaUrl) {
        return json(res, 400, {
          ok: false,
          error: 'Event, title and media URL are required.'
        })
      }

      if (!['Photo','Poster','Video'].includes(type)) {
        return json(res, 400, {
          ok: false,
          error: 'Invalid gallery media type.'
        })
      }

      const event = db.prepare(
        'SELECT id,name FROM events WHERE id=?'
      ).get(eventId)

      if (!event) {
        return json(res, 404, {
          ok: false,
          error: 'Selected event was not found.'
        })
      }

      const result = db.prepare(`
        INSERT INTO gallery_items(
          event_id,
          type,
          title,
          url,
          published,
          uploaded_by
        )
        VALUES (?,?,?,?,?,?)
      `).run(
        eventId,
        type,
        title,
        mediaUrl,
        published,
        auth.user.id
      )

      db.prepare(`
        INSERT INTO system_audit(
          user_id,
          action,
          entity_type,
          entity_id,
          details
        )
        VALUES (?,?,?,?,?)
      `).run(
        auth.user.id,
        'Created gallery item',
        'Gallery',
        String(result.lastInsertRowid),
        `${title} - ${event.name}`
      )

      return json(res, 201, {
        ok: true,
        id: Number(result.lastInsertRowid)
      })
    }

    const galleryItemMatch =
      url.pathname.match(/^\/api\/admin\/gallery\/(\d+)$/)

    // Update gallery item.
    if (galleryItemMatch && req.method === 'PATCH') {
      const auth = requireAuth(req, res, ['Super Admin'])
      if (!auth) return

      const id = Number(galleryItemMatch[1])

      const existing = db.prepare(
        'SELECT * FROM gallery_items WHERE id=?'
      ).get(id)

      if (!existing) {
        return json(res, 404, {
          ok: false,
          error: 'Gallery item not found.'
        })
      }

      const body = await parseBody(req)

      const eventId =
        body.event_id !== undefined
          ? Number(body.event_id)
          : existing.event_id

      const type =
        body.type !== undefined
          ? clean(body.type)
          : existing.type

      const title =
        body.title !== undefined
          ? clean(body.title)
          : existing.title

      const mediaUrl =
        body.url !== undefined
          ? clean(body.url)
          : existing.url

      const published =
        body.published !== undefined
          ? (body.published ? 1 : 0)
          : existing.published

      if (!eventId || !title || !mediaUrl) {
        return json(res, 400, {
          ok: false,
          error: 'Event, title and media URL are required.'
        })
      }

      if (!['Photo','Poster','Video'].includes(type)) {
        return json(res, 400, {
          ok: false,
          error: 'Invalid gallery media type.'
        })
      }

      const event = db.prepare(
        'SELECT id FROM events WHERE id=?'
      ).get(eventId)

      if (!event) {
        return json(res, 404, {
          ok: false,
          error: 'Selected event was not found.'
        })
      }

      db.prepare(`
        UPDATE gallery_items
        SET
          event_id=?,
          type=?,
          title=?,
          url=?,
          published=?
        WHERE id=?
      `).run(
        eventId,
        type,
        title,
        mediaUrl,
        published,
        id
      )

      db.prepare(`
        INSERT INTO system_audit(
          user_id,
          action,
          entity_type,
          entity_id,
          details
        )
        VALUES (?,?,?,?,?)
      `).run(
        auth.user.id,
        'Updated gallery item',
        'Gallery',
        String(id),
        title
      )

      return json(res, 200, {
        ok: true
      })
    }

    // Delete gallery item.
    if (galleryItemMatch && req.method === 'DELETE') {
      const auth = requireAuth(req, res, ['Super Admin'])
      if (!auth) return

      const id = Number(galleryItemMatch[1])

      const item = db.prepare(
        'SELECT * FROM gallery_items WHERE id=?'
      ).get(id)

      if (!item) {
        return json(res, 404, {
          ok: false,
          error: 'Gallery item not found.'
        })
      }

      db.prepare(
        'DELETE FROM gallery_items WHERE id=?'
      ).run(id)

      db.prepare(`
        INSERT INTO system_audit(
          user_id,
          action,
          entity_type,
          entity_id,
          details
        )
        VALUES (?,?,?,?,?)
      `).run(
        auth.user.id,
        'Deleted gallery item',
        'Gallery',
        String(id),
        item.title
      )

      return json(res, 200, {
        ok: true
      })
    }


    // ============================================================
    // Coordinator Scanner / Event Check-in
    // ============================================================

    if (
      req.method === 'GET' &&
      url.pathname === '/api/coordinator/scanner/events'
    ) {
      const auth = requireAuth(
        req,
        res,
        ['Super Admin','Main Coordinator','Department Coordinator']
      )
      if (!auth) return

      const rows = db.prepare(`
        SELECT *
        FROM events
        WHERE status IN ('Published','Registration Open','Registration Closed','Ongoing','Completed')
        ORDER BY date(event_date) DESC, start_time DESC, id DESC
      `).all()

      const events = rows
        .map(parseEventRow)
        .filter(event => canCoordinateEvent(auth.user,event))
        .map(event => ({
          id:event.id,
          event_code:event.event_code,
          name:event.name,
          event_date:event.event_date,
          start_time:event.start_time,
          end_time:event.end_time,
          venue:event.venue,
          status:event.status,
          payment_type:event.payment_type,
          participation_type:event.participation_type ||
            event.registration_mode
        }))

      return json(res,200,{
        ok:true,
        events
      })
    }


    if (
      req.method === 'GET' &&
      url.pathname === '/api/coordinator/scanner/lookup'
    ) {
      const auth = requireAuth(
        req,
        res,
        ['Super Admin','Main Coordinator','Department Coordinator']
      )
      if (!auth) return

      const eventId = Number(
        url.searchParams.get('event_id') || 0
      )

      const studentId = clean(
        url.searchParams.get('student_id')
      )

      if (!eventId) {
        return json(res,400,{
          ok:false,
          error:'Choose an event first.'
        })
      }

      if (!studentId) {
        return json(res,400,{
          ok:false,
          error:'Student ID is required.'
        })
      }

      const eventRow = db.prepare(
        'SELECT * FROM events WHERE id=?'
      ).get(eventId)

      if (!eventRow) {
        return json(res,404,{
          ok:false,
          error:'Event not found.'
        })
      }

      const event = parseEventRow(eventRow)

      if (!canCoordinateEvent(auth.user,event)) {
        return json(res,403,{
          ok:false,
          error:'You are not allowed to manage attendance for this event.'
        })
      }

      const student = getStudentById(studentId)

      if (!student) {
        return json(res,404,{
          ok:false,
          error:'Student ID was not found in the Student Directory.'
        })
      }

      let registration = db.prepare(`
        SELECT *
        FROM registrations
        WHERE event_id=?
          AND registration_type='Individual'
          AND student_id=?
        ORDER BY id DESC
        LIMIT 1
      `).get(eventId,student.student_id)

      let team = null

      if (!registration) {
        registration = db.prepare(`
          SELECT r.*
          FROM registrations r
          JOIN team_members tm
            ON tm.team_id=r.team_id
          WHERE r.event_id=?
            AND r.registration_type='Team'
            AND tm.student_id=?
            AND tm.status IN ('Accepted','Verified')
          ORDER BY r.id DESC
          LIMIT 1
        `).get(eventId,student.student_id)

        if (registration?.team_id) {
          team = getTeam(registration.team_id)
        }
      }

      if (!registration) {
        return json(res,404,{
          ok:false,
          error:'This student is not registered for the selected event.',
          student
        })
      }

      if (
        ['Rejected','Cancelled','Waiting List'].includes(
          registration.status
        )
      ) {
        return json(res,409,{
          ok:false,
          error:`Registration status is ${registration.status}. Check-in is not allowed.`,
          student,
          registration:registrationPayload(registration)
        })
      }

      const payment = db.prepare(`
        SELECT *
        FROM payments
        WHERE registration_id=?
        ORDER BY id DESC
        LIMIT 1
      `).get(registration.id) || null

      const paymentRequired =
        event.payment_type === 'Paid'

      const paymentVerified =
        !paymentRequired ||
        payment?.status === 'Paid'

      const registrationConfirmed =
        registration.status === 'Confirmed'

      const existingAttendance = db.prepare(`
        SELECT
          a.*,
          u.name AS verified_by_name
        FROM attendance a
        LEFT JOIN users u
          ON u.id=a.verified_by
        WHERE a.event_id=?
          AND a.student_id=?
        LIMIT 1
      `).get(eventId,student.student_id) || null

      let eligibilityMessage = 'Ready for check-in.'

      if (!registrationConfirmed) {
        eligibilityMessage =
          `Registration status is ${registration.status}.`
      } else if (!paymentVerified) {
        eligibilityMessage =
          'Payment has not been verified.'
      } else if (existingAttendance) {
        eligibilityMessage =
          'Student is already checked in.'
      }

      return json(res,200,{
        ok:true,
        event,
        student,
        registration:registrationPayload(registration),
        team,
        payment,
        payment_required:paymentRequired,
        payment_verified:paymentVerified,
        registration_confirmed:registrationConfirmed,
        already_checked_in:Boolean(existingAttendance),
        attendance:existingAttendance,
        can_check_in:
          registrationConfirmed &&
          paymentVerified &&
          !existingAttendance,
        eligibility_message:eligibilityMessage
      })
    }


    if (
      req.method === 'POST' &&
      url.pathname === '/api/coordinator/scanner/check-in'
    ) {
      const auth = requireAuth(
        req,
        res,
        ['Super Admin','Main Coordinator','Department Coordinator']
      )
      if (!auth) return

      const body = await parseBody(req)

      const eventId = Number(body.event_id || 0)
      const studentId = clean(body.student_id)

      if (!eventId || !studentId) {
        return json(res,400,{
          ok:false,
          error:'Event and Student ID are required.'
        })
      }

      const eventRow = db.prepare(
        'SELECT * FROM events WHERE id=?'
      ).get(eventId)

      if (!eventRow) {
        return json(res,404,{
          ok:false,
          error:'Event not found.'
        })
      }

      const event = parseEventRow(eventRow)

      if (!canCoordinateEvent(auth.user,event)) {
        return json(res,403,{
          ok:false,
          error:'You are not allowed to check in students for this event.'
        })
      }

      const student = getStudentById(studentId)

      if (!student) {
        return json(res,404,{
          ok:false,
          error:'Student ID was not found in the Student Directory.'
        })
      }

      let registration = db.prepare(`
        SELECT *
        FROM registrations
        WHERE event_id=?
          AND registration_type='Individual'
          AND student_id=?
        ORDER BY id DESC
        LIMIT 1
      `).get(eventId,student.student_id)

      let teamId = null

      if (!registration) {
        registration = db.prepare(`
          SELECT r.*
          FROM registrations r
          JOIN team_members tm
            ON tm.team_id=r.team_id
          WHERE r.event_id=?
            AND r.registration_type='Team'
            AND tm.student_id=?
            AND tm.status IN ('Accepted','Verified')
          ORDER BY r.id DESC
          LIMIT 1
        `).get(eventId,student.student_id)
      }

      if (!registration) {
        return json(res,409,{
          ok:false,
          error:'Student is not registered for this event.'
        })
      }

      if (registration.status !== 'Confirmed') {
        return json(res,409,{
          ok:false,
          error:`Registration must be Confirmed before check-in. Current status: ${registration.status}.`
        })
      }

      teamId =
        registration.registration_type === 'Team'
          ? registration.team_id
          : null

      if (event.payment_type === 'Paid') {
        const paid = db.prepare(`
          SELECT id
          FROM payments
          WHERE registration_id=?
            AND status='Paid'
          ORDER BY id DESC
          LIMIT 1
        `).get(registration.id)

        if (!paid) {
          return json(res,409,{
            ok:false,
            error:'Payment must be verified before check-in.'
          })
        }
      }

      const existing = db.prepare(`
        SELECT *
        FROM attendance
        WHERE event_id=?
          AND student_id=?
        LIMIT 1
      `).get(eventId,student.student_id)

      if (existing) {
        return json(res,409,{
          ok:false,
          error:'Student is already checked in.',
          attendance:existing
        })
      }

      let result

      try {
        result = db.prepare(`
          INSERT INTO attendance(
            event_id,
            student_id,
            team_id,
            method,
            verified_by,
            status
          )
          VALUES (?,?,?,?,?,'Present')
        `).run(
          eventId,
          student.student_id,
          teamId,
          'Manual',
          auth.user.id
        )
      } catch (error) {
        if (
          String(error?.message || '')
            .toLowerCase()
            .includes('unique')
        ) {
          return json(res,409,{
            ok:false,
            error:'Student is already checked in.'
          })
        }
        throw error
      }

      const attendanceId = Number(
        result.lastInsertRowid
      )

      const attendance = db.prepare(`
        SELECT
          a.*,
          u.name AS verified_by_name
        FROM attendance a
        LEFT JOIN users u
          ON u.id=a.verified_by
        WHERE a.id=?
      `).get(attendanceId)

      db.prepare(`
        INSERT INTO system_audit(
          user_id,
          action,
          entity_type,
          entity_id,
          details
        )
        VALUES (?,?,?,?,?)
      `).run(
        auth.user.id,
        'Student checked in',
        'Attendance',
        String(attendanceId),
        JSON.stringify({
          event_id:eventId,
          student_id:student.student_id,
          team_id:teamId,
          method:'Manual'
        })
      )

      return json(res,201,{
        ok:true,
        message:'Check-in completed successfully.',
        attendance,
        student,
        event
      })
    }

    // Coordinator Attendance Report
    if (
      req.method === 'GET' &&
      url.pathname === '/api/coordinator/reports/attendance'
    ) {
      const auth = requireAuth(
        req,
        res,
        ['Super Admin','HOD','Main Coordinator','Department Coordinator']
      )
      if (!auth) return

      const eventId = Number(url.searchParams.get('event_id') || 0)

      if (!eventId) {
        return json(res,400,{
          ok:false,
          error:'Event is required.'
        })
      }

      const event = db.prepare(
        'SELECT * FROM events WHERE id=?'
      ).get(eventId)

      if (!event) {
        return json(res,404,{
          ok:false,
          error:'Event not found.'
        })
      }

      if (!canReadEvent(auth.user,event)) {
        return json(res,403,{
          ok:false,
          error:'You do not manage this event.'
        })
      }

      const rows = db.prepare(`
        SELECT
          a.id,
          a.event_id,
          a.student_id,
          a.team_id,
          a.check_in_at,
          a.method,
          a.status,
          a.verified_by,

          s.name AS student_name,
          s.roll_no,
          s.department,
          s.year,
          s.semester,

          t.team_name,
          t.team_code,

          u.name AS verified_by_name

        FROM attendance a

        LEFT JOIN students s
          ON s.student_id=a.student_id

        LEFT JOIN teams t
          ON t.id=a.team_id

        LEFT JOIN users u
          ON u.id=a.verified_by

        WHERE a.event_id=?

        ORDER BY
          datetime(a.check_in_at) DESC,
          s.name COLLATE NOCASE
      `).all(eventId)

      const counts = {
        total: rows.length,
        present: rows.filter(x=>x.status==='Present').length,
        absent: rows.filter(x=>x.status==='Absent').length,
        excused: rows.filter(x=>x.status==='Excused').length,
        corrected: rows.filter(x=>x.status==='Corrected').length
      }

      return json(res,200,{
        ok:true,
        event:parseEventRow(event),
        rows,
        summary:counts
      })
    }

    if (
      req.method === 'PATCH' &&
      url.pathname === '/api/coordinator/reports/attendance'
    ) {
      const auth = requireAuth(
        req,
        res,
        ['Super Admin','Main Coordinator','Department Coordinator']
      )
      if (!auth) return

      const body = await parseBody(req)

      const attendanceId = Number(body.attendance_id || 0)
      const nextStatus = clean(body.status)
      const reason = clean(body.reason)

      if (!attendanceId) {
        return json(res,400,{
          ok:false,
          error:'Attendance record is required.'
        })
      }

      if (!['Present','Absent','Excused','Corrected'].includes(nextStatus)) {
        return json(res,400,{
          ok:false,
          error:'Choose a valid attendance status.'
        })
      }

      if (!reason) {
        return json(res,400,{
          ok:false,
          error:'Correction reason is required.'
        })
      }

      const attendance = db.prepare(
        'SELECT * FROM attendance WHERE id=?'
      ).get(attendanceId)

      if (!attendance) {
        return json(res,404,{
          ok:false,
          error:'Attendance record not found.'
        })
      }

      const event = db.prepare(
        'SELECT * FROM events WHERE id=?'
      ).get(attendance.event_id)

      if (!event) {
        return json(res,404,{
          ok:false,
          error:'Event not found.'
        })
      }

      if (!canCoordinateEvent(auth.user,event)) {
        return json(res,403,{
          ok:false,
          error:'You do not manage this event.'
        })
      }

      const previousStatus = attendance.status

      db.prepare(`
        UPDATE attendance
        SET
          status=?,
          verified_by=?
        WHERE id=?
      `).run(
        nextStatus,
        auth.user.id,
        attendanceId
      )

      db.prepare(`
        INSERT INTO system_audit(
          user_id,
          action,
          entity_type,
          entity_id,
          details
        )
        VALUES (?,?,?,?,?)
      `).run(
        auth.user.id,
        'Attendance correction',
        'Attendance',
        String(attendanceId),
        JSON.stringify({
          event_id:attendance.event_id,
          student_id:attendance.student_id,
          previous_status:previousStatus,
          new_status:nextStatus,
          reason
        })
      )

      return json(res,200,{
        ok:true,
        message:'Attendance record updated.'
      })
    }

    // V1.0 engagement, activity and reporting endpoints.
    // Functional Super Admin operations workspace.
    if (req.method === 'GET' && url.pathname === '/api/admin/operations') {
      const auth=requireAuth(req,res,['Super Admin']);if(!auth)return
      const events=db.prepare(`SELECT e.*, (SELECT COUNT(*) FROM registrations r WHERE r.event_id=e.id AND r.status!='Cancelled') AS registration_count FROM events e ORDER BY date(e.event_date) DESC,e.start_time DESC`).all().map(parseEventRow)
      const students=db.prepare('SELECT student_id,name,department,year,semester,status FROM students ORDER BY name COLLATE NOCASE').all()
      const users=db.prepare('SELECT id,name,role,department,active FROM users ORDER BY name COLLATE NOCASE').all()
      const venues=db.prepare('SELECT * FROM venues ORDER BY active DESC,name COLLATE NOCASE').all().map(v=>({...v,active:Boolean(v.active)}))
      const payments=db.prepare('SELECT id,event_id,registration_id,amount,method,status,created_at FROM payments ORDER BY created_at DESC LIMIT 500').all()
      const attendance=db.prepare('SELECT id,event_id,student_id,status,check_in_at FROM attendance ORDER BY check_in_at DESC LIMIT 500').all()
      const results=db.prepare(`SELECT r.*,s.name AS student_name,e.name AS event_name FROM results r LEFT JOIN students s ON s.student_id=r.student_id JOIN events e ON e.id=r.event_id ORDER BY r.created_at DESC LIMIT 500`).all()
      const rules=db.prepare('SELECT * FROM achievement_rules ORDER BY id').all()
      const audit=db.prepare(`SELECT a.*,u.name AS user_name FROM system_audit a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT 250`).all()
      const settings=db.prepare('SELECT key,value,updated_at FROM app_settings ORDER BY key').all()
      const notifications=db.prepare(`SELECT n.*,u.name AS user_name FROM notifications n LEFT JOIN users u ON u.id=n.user_id ORDER BY n.created_at DESC LIMIT 250`).all()
      return json(res,200,{ok:true,events,students,users,venues,payments,attendance,results,rules,audit,settings,notifications})
    }
    if(req.method==='POST'&&url.pathname==='/api/admin/venues'){
      const auth=requireAuth(req,res,['Super Admin']);if(!auth)return;const b=await parseBody(req);const name=clean(b.name),type=clean(b.type)||'Other';if(!name)return json(res,400,{ok:false,error:'Venue name is required.'});
      try{const x=db.prepare('INSERT INTO venues(name,type) VALUES (?,?)').run(name,type);db.prepare('INSERT INTO system_audit(user_id,action,entity_type,entity_id,details) VALUES (?,?,?,?,?)').run(auth.user.id,'Created venue','Venue',String(x.lastInsertRowid),name);return json(res,201,{ok:true})}catch(e){return json(res,409,{ok:false,error:'A venue with this name already exists.'})}
    }
    const adminVenueDelete=url.pathname.match(/^\/api\/admin\/venues\/(\d+)$/);
    if(adminVenueDelete&&req.method==='DELETE'){const auth=requireAuth(req,res,['Super Admin']);if(!auth)return;const id=Number(adminVenueDelete[1]),v=db.prepare('SELECT * FROM venues WHERE id=?').get(id);if(!v)return json(res,404,{ok:false,error:'Venue not found.'});const used=Number(db.prepare('SELECT COUNT(*) AS c FROM events WHERE venue=?').get(v.name)?.c||0);if(used)return json(res,409,{ok:false,error:'This venue is already used by events and cannot be deleted.'});db.prepare('DELETE FROM venues WHERE id=?').run(id);db.prepare('INSERT INTO system_audit(user_id,action,entity_type,entity_id,details) VALUES (?,?,?,?,?)').run(auth.user.id,'Deleted venue','Venue',String(id),v.name);return json(res,200,{ok:true})}
    if(req.method==='PATCH'&&url.pathname==='/api/admin/settings'){const auth=requireAuth(req,res,['Super Admin']);if(!auth)return;const b=await parseBody(req),key=clean(b.key),value=clean(b.value);if(!key)return json(res,400,{ok:false,error:'Setting key is required.'});db.prepare(`INSERT INTO app_settings(key,value,updated_at) VALUES (?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`).run(key,value);db.prepare('INSERT INTO system_audit(user_id,action,entity_type,entity_id,details) VALUES (?,?,?,?,?)').run(auth.user.id,'Updated setting','Setting',key,value);return json(res,200,{ok:true})}
    if(req.method==='POST'&&url.pathname==='/api/admin/notifications/broadcast'){const auth=requireAuth(req,res,['Super Admin']);if(!auth)return;const b=await parseBody(req),title=clean(b.title),message=clean(b.message),audience=clean(b.audience)||'All Students';if(!title||!message)return json(res,400,{ok:false,error:'Title and message are required.'});let users;if(audience==='All Students')users=db.prepare("SELECT id FROM users WHERE role='Student' AND active=1").all();else users=db.prepare("SELECT id FROM users WHERE role='Student' AND active=1 AND department=?").all(audience);const ins=db.prepare("INSERT INTO notifications(user_id,title,message,channel) VALUES (?,?,?,'In-App')");for(const u of users)ins.run(u.id,title,message);db.prepare('INSERT INTO system_audit(user_id,action,entity_type,entity_id,details) VALUES (?,?,?,?,?)').run(auth.user.id,'Sent notification','Notification',audience,`${title} • ${users.length} recipients`);return json(res,200,{ok:true,sent:users.length})}

    if (req.method === 'GET' && url.pathname === '/api/leaderboard') {
      const auth = requireAuth(req, res)
      if (!auth) return
      const scope = clean(url.searchParams.get('scope') || 'Overall')
      let where = "r.published=1 AND r.student_id IS NOT NULL"
      const params = []
      if (scope === 'Department' && auth.user.department) { where += ' AND s.department=?'; params.push(auth.user.department) }
      const rows = db.prepare(`SELECT s.student_id,s.name,s.department,s.year,COALESCE(SUM(r.points_awarded),0) AS points,COALESCE(SUM(CASE WHEN r.position=1 THEN 1 ELSE 0 END),0) AS wins FROM results r JOIN students s ON s.student_id=r.student_id WHERE ${where} GROUP BY s.student_id,s.name,s.department,s.year ORDER BY points DESC,wins DESC,s.name COLLATE NOCASE LIMIT 100`).all(...params)
      return json(res,200,{ok:true,scope,rows:rows.map((x,i)=>({...x,rank:i+1}))})
    }


    // ============================================================
    // COORDINATOR COMMUNICATION - PAYMENT PENDING
    // Sends an in-app reminder only to participants whose
    // registration is currently Payment Pending.
    // ============================================================
    if (
      req.method === 'POST' &&
      url.pathname === '/api/coordinator/notifications/payment-pending'
    ) {
      const auth = requireAuth(
        req,
        res,
        ['Super Admin','Main Coordinator','Department Coordinator']
      )
      if (!auth) return

      const body = await parseBody(req)

      const eventId = Number(body.event_id || 0)
      const title = clean(body.title)
      const message = clean(body.message)

      if (!eventId) {
        return json(res,400,{
          ok:false,
          error:'Event is required.'
        })
      }

      if (!title || !message) {
        return json(res,400,{
          ok:false,
          error:'Subject and message are required.'
        })
      }

      const event = db.prepare(
        'SELECT * FROM events WHERE id=?'
      ).get(eventId)

      if (!event) {
        return json(res,404,{
          ok:false,
          error:'Event not found.'
        })
      }

      if (!canCoordinateEvent(auth.user,event)) {
        return json(res,403,{
          ok:false,
          error:'You do not have permission to communicate for this event.'
        })
      }

      const registrations = db.prepare(`
        SELECT *
        FROM registrations
        WHERE event_id=?
          AND status='Payment Pending'
        ORDER BY id
      `).all(eventId)

      const studentIds = new Set()

      for (const registration of registrations) {
        for (const studentId of registrationStudentIds(registration)) {
          if (studentId) {
            studentIds.add(studentId)
          }
        }
      }

      if (studentIds.size === 0) {
        return json(res,409,{
          ok:false,
          error:'No payment-pending participants found for this event.'
        })
      }

      const insertNotification = db.prepare(`
        INSERT INTO notifications(
          user_id,
          title,
          message,
          channel,
          event_id,
          target_url
        )
        VALUES (?, ?, ?, 'In-App', ?, ?)
      `)

      let sent = 0
      let skipped = 0

      db.exec('BEGIN')

      try {
        for (const studentId of studentIds) {
          const user = db.prepare(`
            SELECT id
            FROM users
            WHERE student_id=?
              AND role='Student'
              AND active=1
          `).get(studentId)

          if (!user) {
            skipped++
            continue
          }

          insertNotification.run(
            user.id,
            title,
            message,
            event.id,
            '/student/registrations'
          )

          sent++
        }

        db.prepare(`
          INSERT INTO system_audit(
            user_id,
            action,
            entity_type,
            entity_id,
            details
          )
          VALUES (?,?,?,?,?)
        `).run(
          auth.user.id,
          'Sent payment reminder',
          'Event',
          String(event.id),
          `${event.name} | ${title} | ${sent} recipients`
        )

        db.exec('COMMIT')
      } catch (error) {
        try { db.exec('ROLLBACK') } catch {}
        throw error
      }

      return json(res,200,{
        ok:true,
        sent,
        skipped,
        total_students:studentIds.size,
        message:`Payment reminder sent to ${sent} participant(s).`
      })
    }
    // Coordinator communication - attendees and published winners.
    if (
      req.method === 'GET' &&
      url.pathname === '/api/coordinator/notifications/post-event-audience'
    ) {
      const auth = requireAuth(
        req,
        res,
        ['Super Admin','Main Coordinator','Department Coordinator']
      )
      if (!auth) return

      const eventId = Number(url.searchParams.get('event_id') || 0)
      const audience = clean(url.searchParams.get('audience') || 'Attendees')

      if (!eventId) {
        return json(res,400,{ok:false,error:'Event is required.'})
      }

      if (!['Attendees','Winners'].includes(audience)) {
        return json(res,400,{ok:false,error:'Invalid audience.'})
      }

      const event = db.prepare(
        'SELECT * FROM events WHERE id=?'
      ).get(eventId)

      if (!event) {
        return json(res,404,{ok:false,error:'Event not found.'})
      }

      if (!canCoordinateEvent(auth.user,event)) {
        return json(res,403,{
          ok:false,
          error:'You do not manage this event.'
        })
      }

      let studentIds = []

      if (audience === 'Attendees') {
        studentIds = db.prepare(`
          SELECT DISTINCT student_id
          FROM attendance
          WHERE event_id=?
            AND status='Present'
            AND student_id IS NOT NULL
        `).all(eventId).map(row=>row.student_id)
      } else {
        const results = db.prepare(`
          SELECT student_id,team_id
          FROM results
          WHERE event_id=?
            AND published=1
        `).all(eventId)

        for (const result of results) {
          if (result.student_id) {
            studentIds.push(result.student_id)
          }

          if (result.team_id) {
            const members = db.prepare(`
              SELECT student_id
              FROM team_members
              WHERE team_id=?
                AND status!='Declined'
            `).all(result.team_id)

            studentIds.push(
              ...members.map(member=>member.student_id)
            )
          }
        }
      }

      studentIds = [...new Set(studentIds.filter(Boolean))]

      const students = studentIds.map(studentId=>{
        const student = db.prepare(`
          SELECT student_id,name,roll_no,department,year,semester
          FROM students
          WHERE student_id=?
        `).get(studentId)

        return student || {
          student_id:studentId,
          name:studentId
        }
      })

      return json(res,200,{
        ok:true,
        audience,
        count:students.length,
        rows:students
      })
    }

    if (
      req.method === 'POST' &&
      url.pathname === '/api/coordinator/notifications/post-event-audience'
    ) {
      const auth = requireAuth(
        req,
        res,
        ['Super Admin','Main Coordinator','Department Coordinator']
      )
      if (!auth) return

      const body = await parseBody(req)

      const eventId = Number(body.event_id || 0)
      const audience = clean(body.audience || 'Attendees')
      const title = clean(body.title)
      const message = clean(body.message)

      if (!eventId) {
        return json(res,400,{ok:false,error:'Event is required.'})
      }

      if (!['Attendees','Winners'].includes(audience)) {
        return json(res,400,{ok:false,error:'Invalid audience.'})
      }

      if (!title || !message) {
        return json(res,400,{
          ok:false,
          error:'Subject and message are required.'
        })
      }

      const event = db.prepare(
        'SELECT * FROM events WHERE id=?'
      ).get(eventId)

      if (!event) {
        return json(res,404,{ok:false,error:'Event not found.'})
      }

      if (!canCoordinateEvent(auth.user,event)) {
        return json(res,403,{
          ok:false,
          error:'You do not manage this event.'
        })
      }

      let studentIds = []

      if (audience === 'Attendees') {
        studentIds = db.prepare(`
          SELECT DISTINCT student_id
          FROM attendance
          WHERE event_id=?
            AND status='Present'
            AND student_id IS NOT NULL
        `).all(eventId).map(row=>row.student_id)
      } else {
        const results = db.prepare(`
          SELECT student_id,team_id
          FROM results
          WHERE event_id=?
            AND published=1
        `).all(eventId)

        for (const result of results) {
          if (result.student_id) {
            studentIds.push(result.student_id)
          }

          if (result.team_id) {
            const members = db.prepare(`
              SELECT student_id
              FROM team_members
              WHERE team_id=?
                AND status!='Declined'
            `).all(result.team_id)

            studentIds.push(
              ...members.map(member=>member.student_id)
            )
          }
        }
      }

      studentIds = [...new Set(studentIds.filter(Boolean))]

      if (!studentIds.length) {
        return json(res,409,{
          ok:false,
          error:
            audience === 'Attendees'
              ? 'No attendees found for this event.'
              : 'No published winners found for this event.'
        })
      }

      const insertNotification = db.prepare(`
        INSERT INTO notifications(
          user_id,
          title,
          message,
          channel,
          event_id,
          target_url
        )
        VALUES (?, ?, ?, 'In-App', ?, ?)
      `)

      let sent = 0
      let skipped = 0

      db.exec('BEGIN')

      try {
        for (const studentId of studentIds) {
          const user = db.prepare(`
            SELECT id
            FROM users
            WHERE student_id=?
              AND role='Student'
              AND active=1
          `).get(studentId)

          if (!user) {
            skipped++
            continue
          }

          const targetUrl =
            audience === 'Winners'
              ? '/student/results'
              : '/student/activity'

          insertNotification.run(
            user.id,
            title,
            message,
            event.id,
            targetUrl
          )

          sent++
        }

        db.prepare(`
          INSERT INTO system_audit(
            user_id,
            action,
            entity_type,
            entity_id,
            details
          )
          VALUES (?,?,?,?,?)
        `).run(
          auth.user.id,
          'Sent post-event notification',
          'Event',
          String(event.id),
          `${event.name} | ${audience} | ${title} | ${sent} recipients`
        )

        db.exec('COMMIT')
      } catch (error) {
        try { db.exec('ROLLBACK') } catch {}
        throw error
      }

      return json(res,200,{
        ok:true,
        audience,
        sent,
        skipped,
        total_students:studentIds.length,
        message:`Message sent to ${sent} ${audience.toLowerCase()}.`
      })
    }
    // Coordinator communication - registered team leaders.
    if (
      req.method === 'POST' &&
      url.pathname === '/api/coordinator/notifications/team-leaders'
    ) {
      const auth = requireAuth(
        req,
        res,
        ['Super Admin','Main Coordinator','Department Coordinator']
      )
      if (!auth) return

      const body = await parseBody(req)
      const eventId = Number(body.event_id || 0)
      const title = clean(body.title)
      const message = clean(body.message)

      if (!eventId) {
        return json(res,400,{
          ok:false,
          error:'Event is required.'
        })
      }

      if (!title || !message) {
        return json(res,400,{
          ok:false,
          error:'Subject and message are required.'
        })
      }

      const event = db.prepare(
        'SELECT * FROM events WHERE id=?'
      ).get(eventId)

      if (!event) {
        return json(res,404,{
          ok:false,
          error:'Event not found.'
        })
      }

      if (!canCoordinateEvent(auth.user,event)) {
        return json(res,403,{
          ok:false,
          error:'You do not manage this event.'
        })
      }

      const leaders = db.prepare(`
        SELECT DISTINCT
          t.leader_student_id AS student_id
        FROM registrations r
        JOIN teams t ON t.id=r.team_id
        WHERE r.event_id=?
          AND r.registration_type='Team'
          AND r.team_id IS NOT NULL
          AND r.status NOT IN ('Cancelled','Rejected')
          AND t.status NOT IN ('Rejected')
          AND t.leader_student_id IS NOT NULL
      `).all(eventId)

      const studentIds = [
        ...new Set(
          leaders.map(row=>row.student_id).filter(Boolean)
        )
      ]

      if (!studentIds.length) {
        return json(res,409,{
          ok:false,
          error:'No registered team leaders found for this event.'
        })
      }

      const insertNotification = db.prepare(`
        INSERT INTO notifications(
          user_id,
          title,
          message,
          channel,
          event_id,
          target_url
        )
        VALUES (?, ?, ?, 'In-App', ?, ?)
      `)

      let sent = 0
      let skipped = 0

      db.exec('BEGIN')

      try {
        for (const studentId of studentIds) {
          const user = db.prepare(`
            SELECT id
            FROM users
            WHERE student_id=?
              AND role='Student'
              AND active=1
          `).get(studentId)

          if (!user) {
            skipped++
            continue
          }

          insertNotification.run(
            user.id,
            title,
            message,
            event.id,
            '/student/teams'
          )

          sent++
        }

        db.exec('COMMIT')
      } catch (error) {
        try { db.exec('ROLLBACK') } catch {}
        throw error
      }

      return json(res,200,{
        ok:true,
        sent,
        skipped,
        total_leaders:studentIds.length,
        message:`Team instructions sent to ${sent} team leader(s).`
      })
    }
    // Coordinator communication — registered participants.
    if (req.method === 'POST' && url.pathname === '/api/coordinator/notifications/registered') {
      const auth = requireAuth(
        req,
        res,
        ['Super Admin','Main Coordinator','Department Coordinator']
      )
      if (!auth) return

      const body = await parseBody(req)
      const eventId = Number(body.event_id || 0)
      const title = clean(body.title)
      const message = clean(body.message)

      if (!eventId) {
        return json(res,400,{ok:false,error:'Event is required.'})
      }

      if (!title || !message) {
        return json(res,400,{
          ok:false,
          error:'Subject and message are required.'
        })
      }

      const event = db.prepare(
        'SELECT * FROM events WHERE id=?'
      ).get(eventId)

      if (!event) {
        return json(res,404,{ok:false,error:'Event not found.'})
      }

      if (!canCoordinateEvent(auth.user,event)) {
        return json(res,403,{
          ok:false,
          error:'You do not manage this event.'
        })
      }

      const registrations = db.prepare(`
        SELECT *
        FROM registrations
        WHERE event_id=?
          AND status NOT IN ('Cancelled','Rejected')
        ORDER BY created_at
      `).all(eventId)

      const studentIds = [
        ...new Set(
          registrations.flatMap(registrationStudentIds).filter(Boolean)
        )
      ]

      if (!studentIds.length) {
        return json(res,409,{
          ok:false,
          error:'No registered participants were found for this event.'
        })
      }

      const insertNotification = db.prepare(`
        INSERT INTO notifications(
          user_id,
          title,
          message,
          channel,
          event_id,
          target_url
        )
        VALUES (?, ?, ?, 'In-App', ?, ?)
      `)

      let sent = 0
      let skipped = 0

      db.exec('BEGIN')

      try {
        for (const studentId of studentIds) {
          const user = db.prepare(`
            SELECT id
            FROM users
            WHERE student_id=?
              AND role='Student'
              AND active=1
          `).get(studentId)

          if (!user) {
            skipped++
            continue
          }

          insertNotification.run(
            user.id,
            title,
            message,
            event.id,
            `/student/explore?event=${event.id}`
          )

          sent++
        }

        db.prepare(`
          INSERT INTO system_audit(
            user_id,
            action,
            entity_type,
            entity_id,
            details
          )
          VALUES (?,?,?,?,?)
        `).run(
          auth.user.id,
          'Sent registered participant notification',
          'Event',
          String(event.id),
          `${event.name} • ${title} • ${sent} recipients`
        )

        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }

      return json(res,200,{
        ok:true,
        sent,
        skipped,
        total_students:studentIds.length,
        message:`Notification sent to ${sent} registered participant${sent===1?'':'s'}.`
      })
    }
    if (req.method === 'GET' && url.pathname === '/api/notifications') {
      const auth = requireAuth(req,res); if(!auth)return
      const rows=db.prepare('SELECT id,title,message,channel,event_id,target_url,registration_id,read_at,created_at FROM notifications WHERE user_id=? OR user_id IS NULL ORDER BY created_at DESC LIMIT 100').all(auth.user.id)
      const eventRows=db.prepare('SELECT id,name FROM events ORDER BY LENGTH(name) DESC').all()
      const repaired=rows.map(n=>{
        if(n.event_id||n.target_url||n.registration_id)return n
        const hay=`${n.title||''} ${n.message||''}`.toLowerCase()
        const match=eventRows.find(e=>hay.includes(String(e.name||'').toLowerCase()))
        if(!match)return n
        const target_url=`/student/explore?event=${match.id}`
        db.prepare('UPDATE notifications SET event_id=?,target_url=? WHERE id=?').run(match.id,target_url,n.id)
        return {...n,event_id:match.id,target_url}
      })
      return json(res,200,{ok:true,rows:repaired})
    }

    const notificationReadMatch=url.pathname.match(/^\/api\/notifications\/(\d+)\/read$/)
    if(notificationReadMatch&&req.method==='POST'){
      const auth=requireAuth(req,res);if(!auth)return
      db.prepare('UPDATE notifications SET read_at=COALESCE(read_at,CURRENT_TIMESTAMP) WHERE id=? AND user_id=?').run(Number(notificationReadMatch[1]),auth.user.id)
      return json(res,200,{ok:true})
    }
    if (req.method === 'POST' && url.pathname === '/api/notifications/read-all') {
      const auth=requireAuth(req,res);if(!auth)return
      db.prepare("UPDATE notifications SET read_at=COALESCE(read_at,CURRENT_TIMESTAMP) WHERE user_id=?").run(auth.user.id)
      return json(res,200,{ok:true})
    }
    if (req.method === 'GET' && url.pathname === '/api/dashboard/summary') {
      const auth=requireAuth(req,res);if(!auth)return
      const summary={events:Number(db.prepare('SELECT COUNT(*) AS c FROM events').get().c),students:Number(db.prepare('SELECT COUNT(*) AS c FROM students').get().c),registrations:Number(db.prepare('SELECT COUNT(*) AS c FROM registrations').get().c),teams:Number(db.prepare('SELECT COUNT(*) AS c FROM teams').get().c),payments:Number(db.prepare("SELECT COUNT(*) AS c FROM payments WHERE status='Paid'").get().c),results:Number(db.prepare('SELECT COUNT(*) AS c FROM results WHERE published=1').get().c)}
      return json(res,200,{ok:true,summary})
    }
    if (req.method === 'GET' && url.pathname === '/api/achievement-rules') {
      const auth=requireAuth(req,res);if(!auth)return
      return json(res,200,{ok:true,rows:db.prepare('SELECT * FROM achievement_rules ORDER BY id').all()})
    }
    if (req.method === 'PATCH' && url.pathname === '/api/achievement-rules') {
      const auth=requireAuth(req,res,['Super Admin']);if(!auth)return
      const body=await parseBody(req); const code=clean(body.code); const points=Number(body.points)
      if(!code||!Number.isFinite(points))return json(res,400,{ok:false,error:'Rule code and numeric points are required.'})
      db.prepare('UPDATE achievement_rules SET points=? WHERE code=?').run(points,code)
      return json(res,200,{ok:true})
    }
    if (req.method === 'GET' && url.pathname === '/api/certificates/my') {
      const auth=requireAuth(req,res,['Student']);if(!auth)return
      const rows=db.prepare('SELECT c.*,c.type AS certificate_type,c.certificate_id AS verification_code,e.name AS event_name FROM certificates c JOIN events e ON e.id=c.event_id WHERE c.student_id=? ORDER BY c.issued_at DESC').all(auth.user.student_id)
      return json(res,200,{ok:true,rows})
    }
    // ============================================================
    // V3.6 RESULTS & WINNERS
    // Event-scoped result management for authorized coordinators.
    // ============================================================

    if (
      req.method === 'GET' &&
      url.pathname === '/api/coordinator/results'
    ) {
      const auth = requireAuth(
        req,
        res,
        ['Super Admin','Main Coordinator','Department Coordinator']
      )
      if (!auth) return

      const eventId = Number(url.searchParams.get('event_id') || 0)

      if (!Number.isInteger(eventId) || eventId <= 0) {
        return json(res,400,{ok:false,error:'A valid event is required.'})
      }

      const event = db.prepare('SELECT * FROM events WHERE id=?').get(eventId)

      if (!event) {
        return json(res,404,{ok:false,error:'Event not found.'})
      }

      if (!canCoordinateEvent(auth.user,event)) {
        return json(res,403,{ok:false,error:'You do not manage this event.'})
      }

      const registrations = db.prepare(`
        SELECT *
        FROM registrations
        WHERE event_id=?
          AND status NOT IN ('Rejected','Cancelled','Waiting List')
        ORDER BY created_at,id
      `).all(eventId).map(registrationPayload)

      const rows = db.prepare(`
        SELECT
          r.*,
          s.name AS student_name,
          s.department AS student_department,
          t.team_name AS team_name,
          t.team_code AS team_code
        FROM results r
        LEFT JOIN students s ON s.student_id=r.student_id
        LEFT JOIN teams t ON t.id=r.team_id
        WHERE r.event_id=?
        ORDER BY
          r.published ASC,
          CASE WHEN r.position IS NULL THEN 999999 ELSE r.position END,
          r.id
      `).all(eventId)

      return json(res,200,{
        ok:true,
        event:parseEventRow(event),
        registrations,
        rows
      })
    }

    if (
      req.method === 'POST' &&
      url.pathname === '/api/coordinator/results'
    ) {
      const auth = requireAuth(
        req,
        res,
        ['Super Admin','Main Coordinator','Department Coordinator']
      )
      if (!auth) return

      const body = await parseBody(req)
      const eventId = Number(body.event_id || 0)
      const registrationId = Number(body.registration_id || 0)
      const award = clean(body.award)
      const category = clean(body.category)
      const positionRaw = body.position
      const pointsRaw = body.points_awarded

      const position =
        positionRaw === '' || positionRaw === null || positionRaw === undefined
          ? null
          : Number(positionRaw)

      const points = Number(pointsRaw ?? 0)

      if (!Number.isInteger(eventId) || eventId <= 0) {
        return json(res,400,{ok:false,error:'A valid event is required.'})
      }

      if (!Number.isInteger(registrationId) || registrationId <= 0) {
        return json(res,400,{ok:false,error:'Choose a registered participant or team.'})
      }

      if (!award) {
        return json(res,400,{ok:false,error:'Award is required.'})
      }

      if (
        position !== null &&
        (!Number.isInteger(position) || position <= 0)
      ) {
        return json(res,400,{ok:false,error:'Position must be a positive whole number.'})
      }

      if (!Number.isInteger(points) || points < 0) {
        return json(res,400,{ok:false,error:'Points must be a non-negative whole number.'})
      }

      const event = db.prepare('SELECT * FROM events WHERE id=?').get(eventId)

      if (!event) {
        return json(res,404,{ok:false,error:'Event not found.'})
      }

      if (!canCoordinateEvent(auth.user,event)) {
        return json(res,403,{ok:false,error:'You do not manage this event.'})
      }

      const registration = db.prepare(`
        SELECT *
        FROM registrations
        WHERE id=? AND event_id=?
      `).get(registrationId,eventId)

      if (!registration) {
        return json(res,404,{ok:false,error:'Registration not found for this event.'})
      }

      if (['Rejected','Cancelled','Waiting List'].includes(registration.status)) {
        return json(res,409,{
          ok:false,
          error:'This registration is not eligible for a result.'
        })
      }

      const studentId =
        registration.registration_type === 'Individual'
          ? registration.student_id
          : null

      const teamId =
        registration.registration_type === 'Team'
          ? registration.team_id
          : null

      const duplicate = studentId
        ? db.prepare(`
            SELECT id FROM results
            WHERE event_id=? AND student_id=?
          `).get(eventId,studentId)
        : db.prepare(`
            SELECT id FROM results
            WHERE event_id=? AND team_id=?
          `).get(eventId,teamId)

      if (duplicate) {
        return json(res,409,{
          ok:false,
          error:'A result already exists for this participant or team.'
        })
      }

      const inserted = db.prepare(`
        INSERT INTO results(
          event_id,
          student_id,
          team_id,
          award,
          position,
          category,
          points_awarded,
          published,
          created_by
        )
        VALUES (?,?,?,?,?,?,?,0,?)
      `).run(
        eventId,
        studentId,
        teamId,
        award,
        position,
        category || event.category || null,
        points,
        auth.user.id
      )

      const resultId = Number(inserted.lastInsertRowid)

      db.prepare(`
        INSERT INTO system_audit(
          user_id,action,entity_type,entity_id,details
        )
        VALUES (?,?,?,?,?)
      `).run(
        auth.user.id,
        'RESULT_CREATED',
        'Result',
        String(resultId),
        JSON.stringify({
          event_id:eventId,
          student_id:studentId,
          team_id:teamId,
          award,
          position,
          points_awarded:points
        })
      )

      return json(res,201,{
        ok:true,
        id:resultId,
        message:'Result saved as draft.'
      })
    }

    const coordinatorResultMatch =
      url.pathname.match(/^\/api\/coordinator\/results\/(\d+)$/)

    if (coordinatorResultMatch && req.method === 'PATCH') {
      const auth = requireAuth(
        req,
        res,
        ['Super Admin','Main Coordinator','Department Coordinator']
      )
      if (!auth) return

      const resultId = Number(coordinatorResultMatch[1])

      const current = db.prepare(`
        SELECT r.*,e.status AS event_status
        FROM results r
        JOIN events e ON e.id=r.event_id
        WHERE r.id=?
      `).get(resultId)

      if (!current) {
        return json(res,404,{ok:false,error:'Result not found.'})
      }

      const event = db.prepare(
        'SELECT * FROM events WHERE id=?'
      ).get(current.event_id)

      if (!event || !canCoordinateEvent(auth.user,event)) {
        return json(res,403,{ok:false,error:'You do not manage this event.'})
      }

      if (Number(current.published) === 1) {
        return json(res,409,{
          ok:false,
          error:'Published results are locked. Unpublish is not allowed from this workspace.'
        })
      }

      const body = await parseBody(req)
      const award = clean(body.award)
      const category = clean(body.category)

      const position =
        body.position === '' ||
        body.position === null ||
        body.position === undefined
          ? null
          : Number(body.position)

      const points = Number(body.points_awarded ?? 0)

      if (!award) {
        return json(res,400,{ok:false,error:'Award is required.'})
      }

      if (
        position !== null &&
        (!Number.isInteger(position) || position <= 0)
      ) {
        return json(res,400,{ok:false,error:'Position must be a positive whole number.'})
      }

      if (!Number.isInteger(points) || points < 0) {
        return json(res,400,{ok:false,error:'Points must be a non-negative whole number.'})
      }

      db.prepare(`
        UPDATE results
        SET award=?,position=?,category=?,points_awarded=?
        WHERE id=?
      `).run(
        award,
        position,
        category || event.category || null,
        points,
        resultId
      )

      db.prepare(`
        INSERT INTO system_audit(
          user_id,action,entity_type,entity_id,details
        )
        VALUES (?,?,?,?,?)
      `).run(
        auth.user.id,
        'RESULT_UPDATED',
        'Result',
        String(resultId),
        JSON.stringify({
          award,
          position,
          category,
          points_awarded:points
        })
      )

      return json(res,200,{
        ok:true,
        message:'Draft result updated.'
      })
    }

    if (coordinatorResultMatch && req.method === 'DELETE') {
      const auth = requireAuth(
        req,
        res,
        ['Super Admin','Main Coordinator','Department Coordinator']
      )
      if (!auth) return

      const resultId = Number(coordinatorResultMatch[1])
      const current = db.prepare(
        'SELECT * FROM results WHERE id=?'
      ).get(resultId)

      if (!current) {
        return json(res,404,{ok:false,error:'Result not found.'})
      }

      const event = db.prepare(
        'SELECT * FROM events WHERE id=?'
      ).get(current.event_id)

      if (!event || !canCoordinateEvent(auth.user,event)) {
        return json(res,403,{ok:false,error:'You do not manage this event.'})
      }

      if (Number(current.published) === 1) {
        return json(res,409,{
          ok:false,
          error:'Published results cannot be deleted.'
        })
      }

      db.prepare('DELETE FROM results WHERE id=?').run(resultId)

      db.prepare(`
        INSERT INTO system_audit(
          user_id,action,entity_type,entity_id,details
        )
        VALUES (?,?,?,?,?)
      `).run(
        auth.user.id,
        'RESULT_DELETED',
        'Result',
        String(resultId),
        JSON.stringify({event_id:current.event_id})
      )

      return json(res,200,{
        ok:true,
        message:'Draft result deleted.'
      })
    }

    const publishResultMatch =
      url.pathname.match(/^\/api\/coordinator\/results\/(\d+)\/publish$/)

    if (publishResultMatch && req.method === 'POST') {
      const auth = requireAuth(
        req,
        res,
        ['Super Admin','Main Coordinator','Department Coordinator']
      )
      if (!auth) return

      const resultId = Number(publishResultMatch[1])
      const current = db.prepare(
        'SELECT * FROM results WHERE id=?'
      ).get(resultId)

      if (!current) {
        return json(res,404,{ok:false,error:'Result not found.'})
      }

      const event = db.prepare(
        'SELECT * FROM events WHERE id=?'
      ).get(current.event_id)

      if (!event || !canCoordinateEvent(auth.user,event)) {
        return json(res,403,{ok:false,error:'You do not manage this event.'})
      }

      if (Number(current.published) === 1) {
        return json(res,409,{ok:false,error:'This result is already published.'})
      }

      db.prepare(
        'UPDATE results SET published=1 WHERE id=?'
      ).run(resultId)

      const studentIds = current.student_id
        ? [current.student_id]
        : current.team_id
          ? db.prepare(`
              SELECT student_id
              FROM team_members
              WHERE team_id=?
                AND status IN ('Accepted','Verified')
            `).all(current.team_id).map(x=>x.student_id)
          : []

      studentIds.forEach(studentId=>{
        notifyStudent(
          studentId,
          'Event result published',
          `${event.name}: ${current.award}${current.position ? ` - Position #${current.position}` : ''}.`
        )
      })

      db.prepare(`
        INSERT INTO system_audit(
          user_id,action,entity_type,entity_id,details
        )
        VALUES (?,?,?,?,?)
      `).run(
        auth.user.id,
        'RESULT_PUBLISHED',
        'Result',
        String(resultId),
        JSON.stringify({
          event_id:current.event_id,
          notified_students:studentIds
        })
      )

      return json(res,200,{
        ok:true,
        message:'Result published successfully.'
      })
    }
    if (req.method === 'GET' && url.pathname === '/api/results/my') {
      const auth=requireAuth(req,res,['Student']);if(!auth)return
      const rows=db.prepare(`SELECT DISTINCT r.*,e.name AS event_name,e.category
        FROM results r
        JOIN events e ON e.id=r.event_id
        LEFT JOIN team_members tm
          ON tm.team_id=r.team_id
         AND tm.student_id=?
         AND tm.status IN ('Accepted','Verified')
        WHERE r.published=1
          AND (r.student_id=? OR tm.student_id IS NOT NULL)
        ORDER BY r.created_at DESC`).all(auth.user.student_id,auth.user.student_id)
      return json(res,200,{ok:true,rows})
    }
    const paymentOrderMatch=url.pathname.match(/^\/api\/payments\/registration\/(\d+)\/order$/)
    if(paymentOrderMatch&&req.method==='POST'){
      const auth=requireAuth(req,res,['Student']);if(!auth)return
      const registration=db.prepare('SELECT * FROM registrations WHERE id=?').get(Number(paymentOrderMatch[1]));if(!registration)return json(res,404,{ok:false,error:'Registration not found.'})
      const ownsIndividual=registration.student_id===auth.user.student_id
      const ownsTeam=registration.team_id&&db.prepare("SELECT 1 FROM teams WHERE id=? AND leader_student_id=?").get(registration.team_id,auth.user.student_id)
      if(!ownsIndividual&&!ownsTeam)return json(res,403,{ok:false,error:'Only the registered student or team leader can pay for this registration.'})
      if(registration.status!=='Payment Pending')return json(res,409,{ok:false,error:'This registration is not waiting for payment.'})
      const event=db.prepare('SELECT * FROM events WHERE id=?').get(registration.event_id);if(!event||!event.online_payment)return json(res,409,{ok:false,error:'Online payment is not enabled for this event.'})
      const keyId=clean(process.env.RAZORPAY_KEY_ID),keySecret=clean(process.env.RAZORPAY_KEY_SECRET)
      if(!keyId||!keySecret)return json(res,503,{ok:false,error:'Online payment is not configured yet. Add Razorpay test/live keys on the EventHub server.'})
      const payment=ensurePaymentForRegistration(registration.id);if(!payment)return json(res,409,{ok:false,error:'Payment record could not be prepared.'})
      if(payment.status==='Paid')return json(res,409,{ok:false,error:'This payment is already complete.'})
      const amountPaise=Math.round(Number(payment.amount)*100);const receipt=`EH-${registration.id}-${Date.now()}`
      const response=await fetch('https://api.razorpay.com/v1/orders',{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,'Content-Type':'application/json'},body:JSON.stringify({amount:amountPaise,currency:'INR',receipt,notes:{eventhub_registration_id:String(registration.id)}})})
      const order=await response.json();if(!response.ok)return json(res,502,{ok:false,error:order?.error?.description||'Razorpay order could not be created.'})
      db.prepare("UPDATE payments SET method='Razorpay',provider_reference=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(order.id,payment.id)
      return json(res,200,{ok:true,key_id:keyId,order_id:order.id,amount:order.amount,currency:order.currency,event_name:event.name,payment_id:payment.id})
    }

    const paymentVerifyMatch=url.pathname.match(/^\/api\/payments\/registration\/(\d+)\/verify$/)
    if(paymentVerifyMatch&&req.method==='POST'){
      const auth=requireAuth(req,res,['Student']);if(!auth)return
      const registration=db.prepare('SELECT * FROM registrations WHERE id=?').get(Number(paymentVerifyMatch[1]));if(!registration)return json(res,404,{ok:false,error:'Registration not found.'})
      const ownsIndividual=registration.student_id===auth.user.student_id
      const ownsTeam=registration.team_id&&db.prepare("SELECT 1 FROM teams WHERE id=? AND leader_student_id=?").get(registration.team_id,auth.user.student_id)
      if(!ownsIndividual&&!ownsTeam)return json(res,403,{ok:false,error:'You cannot verify payment for this registration.'})
      const body=await parseBody(req);const orderId=clean(body.razorpay_order_id),paymentId=clean(body.razorpay_payment_id),signature=clean(body.razorpay_signature)
      if(!orderId||!paymentId||!signature)return json(res,400,{ok:false,error:'Razorpay payment verification data is incomplete.'})
      const payment=db.prepare("SELECT * FROM payments WHERE registration_id=? AND status='Pending' ORDER BY id DESC LIMIT 1").get(registration.id);if(!payment)return json(res,409,{ok:false,error:'Pending payment record not found.'})
      if(payment.provider_reference!==orderId)return json(res,409,{ok:false,error:'Payment order does not match this EventHub registration.'})
      const secret=clean(process.env.RAZORPAY_KEY_SECRET);if(!secret)return json(res,503,{ok:false,error:'Online payment verification is not configured.'})
      const expected=createHmac('sha256',secret).update(`${orderId}|${paymentId}`).digest('hex')
      if(expected!==signature)return json(res,400,{ok:false,error:'Razorpay signature verification failed.'})
      db.exec('BEGIN');try{db.prepare("UPDATE payments SET status='Paid',receipt_no=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(paymentId,payment.id);db.prepare("UPDATE registrations SET status='Confirmed',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(registration.id);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}
      registrationStudentIds(registration).forEach(studentId=>notifyStudent(studentId,'Payment successful — registration confirmed',`${db.prepare('SELECT name FROM events WHERE id=?').get(registration.event_id)?.name||'Event'}: payment received successfully. Your registration is now confirmed.`))
      return json(res,200,{ok:true,registration:registrationPayload(db.prepare('SELECT * FROM registrations WHERE id=?').get(registration.id))})
    }

    const offlineVerifyMatch=url.pathname.match(/^\/api\/payments\/registration\/(\d+)\/offline-verify$/)
    if(offlineVerifyMatch&&req.method==='POST'){
      const auth=requireAuth(req,res,['Super Admin','Main Coordinator','Department Coordinator']);if(!auth)return
      const registration=db.prepare('SELECT * FROM registrations WHERE id=?').get(Number(offlineVerifyMatch[1]));if(!registration)return json(res,404,{ok:false,error:'Registration not found.'})
      const event=db.prepare('SELECT * FROM events WHERE id=?').get(registration.event_id);if(!event)return json(res,404,{ok:false,error:'Event not found.'})
      if(auth.user.role!=='Super Admin'&&!canCoordinateTeamEvent(auth.user,event))return json(res,403,{ok:false,error:'You do not manage this event.'})
      if(!event.offline_payment)return json(res,409,{ok:false,error:'Offline payment is not enabled for this event.'})
      if(registration.status!=='Payment Pending')return json(res,409,{ok:false,error:'This registration is not waiting for payment.'})
      const payment=ensurePaymentForRegistration(registration.id);if(!payment)return json(res,409,{ok:false,error:'Payment record not found.'})

      const body=await parseBody(req)
      const method=clean(body.method)||'Cash'
      const providerReference=clean(body.provider_reference)||null
      const note=clean(body.notes)||null

      if(!['Cash','Coordinator UPI'].includes(method)){
        return json(res,400,{
          ok:false,
          error:'Choose Cash or Coordinator UPI.'
        })
      }

      if(method==='Coordinator UPI'&&!providerReference){
        return json(res,400,{
          ok:false,
          error:'UPI transaction/reference ID is required.'
        })
      }

      const receiptPrefix=method==='Cash'?'CASH':'UPI'
      const receiptNo=`${receiptPrefix}-${registration.id}-${Date.now()}`

      const auditNote=[
        `${method} payment verified by ${auth.user.name} (${auth.user.role})`,
        providerReference?`Reference: ${providerReference}`:null,
        note?`Note: ${note}`:null
      ].filter(Boolean).join(' | ')

      db.exec('BEGIN')
      try{
        db.prepare(`
          UPDATE payments
          SET method=?,
              provider_reference=?,
              status='Paid',
              receipt_no=?,
              collected_by=?,
              notes=?,
              updated_at=CURRENT_TIMESTAMP
          WHERE id=?
        `).run(
          method,
          providerReference,
          receiptNo,
          auth.user.id,
          auditNote,
          payment.id
        )

        db.prepare(`
          UPDATE registrations
          SET status='Confirmed',
              updated_at=CURRENT_TIMESTAMP
          WHERE id=?
        `).run(registration.id)

        db.prepare(`
          INSERT INTO payment_audit(
            payment_id,
            action,
            reason,
            acted_by
          )
          VALUES (?,?,?,?)
        `).run(
          payment.id,
          'Offline Payment Verified',
          auditNote,
          auth.user.id
        )

        db.exec('COMMIT')
      }catch(e){
        db.exec('ROLLBACK')
        throw e
      }
      registrationStudentIds(registration).forEach(studentId=>notifyStudent(studentId,'Offline payment verified — registration confirmed',`${event.name}: your offline payment was verified successfully. Your registration is now confirmed.`))
      return json(res,200,{ok:true,registration:registrationPayload(db.prepare('SELECT * FROM registrations WHERE id=?').get(registration.id))})
    }

    const identityVerificationMatch =
      url.pathname.match(/^\/api\/identity-verification\/(\d+)\/([^/]+)$/)

    if (identityVerificationMatch && req.method === 'GET') {
      const auth=requireAuth(
        req,
        res,
        ['Super Admin','Main Coordinator','Department Coordinator']
      )
      if(!auth)return

      const eventId=Number(identityVerificationMatch[1])
      const studentId=decodeURIComponent(identityVerificationMatch[2])

      const event=db.prepare(
        'SELECT * FROM events WHERE id=?'
      ).get(eventId)

      if(!event){
        return json(res,404,{
          ok:false,
          error:'Event not found.'
        })
      }

      if(
        auth.user.role!=='Super Admin' &&
        !canCoordinateEvent(auth.user,event)
      ){
        return json(res,403,{
          ok:false,
          error:'You do not manage this event.'
        })
      }

      const student=getStudentById(studentId)

      if(!student){
        return json(res,404,{
          ok:false,
          error:'Student not found.'
        })
      }

      if(
        auth.user.role==='Department Coordinator' &&
        student.department!==auth.user.department
      ){
        return json(res,403,{
          ok:false,
          error:'You can only verify students in your department.'
        })
      }

      const registrations=db.prepare(`
        SELECT *
        FROM registrations
        WHERE event_id=?
          AND (
            student_id=?
            OR team_id IN (
              SELECT team_id
              FROM team_members
              WHERE student_id=?
                AND status IN ('Accepted','Verified')
            )
          )
        ORDER BY created_at DESC
      `).all(
        eventId,
        studentId,
        studentId
      )

      const eligibleRegistration=registrations.find(
        registration =>
          ![
            'Cancelled',
            'Rejected'
          ].includes(registration.status)
      )

      const latestVerification=db.prepare(`
        SELECT
          ivr.*,
          u.name AS approved_by_name
        FROM identity_verification_requests ivr
        LEFT JOIN users u
          ON u.id=ivr.approved_by
        WHERE ivr.event_id=?
          AND ivr.student_id=?
        ORDER BY ivr.id DESC
        LIMIT 1
      `).get(
        eventId,
        studentId
      ) || null

      return json(res,200,{
        ok:true,
        event:parseEventRow(event),
        student,
        registered:Boolean(eligibleRegistration),
        registration:eligibleRegistration
          ? registrationPayload(eligibleRegistration)
          : null,
        verification:latestVerification
      })
    }

    if (
      req.method === 'POST' &&
      url.pathname === '/api/identity-verification'
    ) {
      const auth=requireAuth(
        req,
        res,
        ['Super Admin','Main Coordinator','Department Coordinator']
      )
      if(!auth)return

      const body=await parseBody(req)

      const eventId=Number(body.event_id)
      const studentId=clean(body.student_id)
      const reason=clean(body.reason)

      if(!eventId || !studentId){
        return json(res,400,{
          ok:false,
          error:'Event and student are required.'
        })
      }

      if(!reason){
        return json(res,400,{
          ok:false,
          error:'Verification reason is required.'
        })
      }

      if(reason.length < 5){
        return json(res,400,{
          ok:false,
          error:'Add a clear verification reason.'
        })
      }

      const event=db.prepare(
        'SELECT * FROM events WHERE id=?'
      ).get(eventId)

      if(!event){
        return json(res,404,{
          ok:false,
          error:'Event not found.'
        })
      }

      if(
        auth.user.role!=='Super Admin' &&
        !canCoordinateEvent(auth.user,event)
      ){
        return json(res,403,{
          ok:false,
          error:'You do not manage this event.'
        })
      }

      const student=getStudentById(studentId)

      if(!student){
        return json(res,404,{
          ok:false,
          error:'Student not found.'
        })
      }

      if(
        auth.user.role==='Department Coordinator' &&
        student.department!==auth.user.department
      ){
        return json(res,403,{
          ok:false,
          error:'You can only verify students in your department.'
        })
      }

      const registrations=db.prepare(`
        SELECT *
        FROM registrations
        WHERE event_id=?
          AND (
            student_id=?
            OR team_id IN (
              SELECT team_id
              FROM team_members
              WHERE student_id=?
                AND status IN ('Accepted','Verified')
            )
          )
        ORDER BY created_at DESC
      `).all(
        eventId,
        studentId,
        studentId
      )

      const eligibleRegistration=registrations.find(
        registration =>
          ![
            'Cancelled',
            'Rejected'
          ].includes(registration.status)
      )

      if(!eligibleRegistration){
        return json(res,409,{
          ok:false,
          error:'This student is not registered for the selected event.'
        })
      }

      const existing=db.prepare(`
        SELECT *
        FROM identity_verification_requests
        WHERE event_id=?
          AND student_id=?
          AND status='Approved'
        ORDER BY id DESC
        LIMIT 1
      `).get(
        eventId,
        studentId
      )

      if(existing){
        return json(res,409,{
          ok:false,
          error:'Identity has already been verified for this student and event.'
        })
      }

      db.exec('BEGIN')

      try{
        const result=db.prepare(`
          INSERT INTO identity_verification_requests(
            event_id,
            student_id,
            method,
            reason,
            approved_by,
            status,
            reviewed_at
          )
          VALUES (?,?,'Photo Review',?,?,'Approved',CURRENT_TIMESTAMP)
        `).run(
          eventId,
          studentId,
          reason,
          auth.user.id
        )

        db.prepare(`
          INSERT INTO system_audit(
            user_id,
            action,
            entity_type,
            entity_id,
            details
          )
          VALUES (?,?,?,?,?)
        `).run(
          auth.user.id,
          'Identity Verified',
          'Student',
          studentId,
          `${event.name} • Photo Review • ${reason}`
        )

        db.exec('COMMIT')

        const verification=db.prepare(`
          SELECT
            ivr.*,
            u.name AS approved_by_name
          FROM identity_verification_requests ivr
          LEFT JOIN users u
            ON u.id=ivr.approved_by
          WHERE ivr.id=?
        `).get(result.lastInsertRowid)

        return json(res,201,{
          ok:true,
          verification
        })

      }catch(error){
        db.exec('ROLLBACK')
        throw error
      }
    }

    if (req.method === 'GET' && url.pathname === '/api/payments/my') {
      const auth=requireAuth(req,res,['Student']);if(!auth)return
      const rows=db.prepare(`SELECT DISTINCT p.*,t.leader_student_id,e.name AS event_name,e.online_payment,e.offline_payment FROM payments p JOIN events e ON e.id=p.event_id LEFT JOIN teams t ON t.id=p.team_id LEFT JOIN team_members tm ON tm.team_id=p.team_id AND tm.status IN ('Accepted','Verified') WHERE p.student_id=? OR tm.student_id=? ORDER BY p.created_at DESC`).all(auth.user.student_id,auth.user.student_id).map(x=>({...x,can_pay:x.student_id===auth.user.student_id||x.leader_student_id===auth.user.student_id,online_payment:Boolean(x.online_payment),offline_payment:Boolean(x.offline_payment)}))
      return json(res,200,{ok:true,rows})
    }

    return json(res, 404, { ok: false, error: 'API route not found.' })
  } catch (error) {
    console.error(error)
    if (['Invalid JSON body','Request too large'].includes(error.message)) return json(res, error.message === 'Request too large' ? 413 : 400, { ok: false, error: error.message })
    return json(res, 500, { ok: false, error: 'The server could not complete this request.' })
  }
})

// Where to listen. Locally the API only accepts connections from this computer (127.0.0.1).
// On a hosting service (which sets PORT) or when EVENTHUB_HOST=0.0.0.0 it accepts outside connections.
const HOST = process.env.EVENTHUB_HOST || (process.env.PORT ? '0.0.0.0' : '127.0.0.1')
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') console.error(`\nPort ${PORT} is already in use. Another EventHub (or app) is running there.\nClose it, or start this one on another port:  EVENTHUB_API_PORT=8790 npm start\n`)
  else if (error.code === 'EACCES') console.error(`\nNo permission to use port ${PORT}. Choose a port above 1024 with EVENTHUB_API_PORT.\n`)
  else console.error(error)
  process.exit(1)
})
server.listen(PORT, HOST, () => {
  const shown = HOST === '0.0.0.0' ? '127.0.0.1' : HOST
  console.log(`GEMS EventHub API running at http://${shown}:${server.address().port}`)
  if (HOST === '0.0.0.0') console.log('Listening on all network interfaces (other devices can connect).')
  console.log(`Database: ${join(dataDir, 'eventhub.sqlite')}`)
  sheetsSync.start()
})
process.on('SIGTERM', () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref() })
