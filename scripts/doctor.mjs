// "npm run doctor": checks everything the backend needs and says what to fix.
import { existsSync, mkdirSync, accessSync, constants, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import net from 'node:net'
import { requireNode } from './preflight.mjs'

const root = process.cwd()
const dataDir = process.env.EVENTHUB_DATA_DIR || join(root, 'data')
const port = Number(process.env.EVENTHUB_API_PORT ?? process.env.PORT ?? 8787)
let problems = 0
const ok = (m) => console.log(`  OK    ${m}`)
const warn = (m) => console.log(`  NOTE  ${m}`)
const bad = (m) => { problems += 1; console.log(`  FIX   ${m}`) }

console.log('\nGEMS EventHub doctor\n')
console.log(`Node ${process.version} on ${process.platform} ${process.arch}`)
requireNode(); ok('Node.js version is new enough')

for (const f of ['server/index.mjs', 'src/App.tsx', 'public/assets/gems-logo.png', 'google-sheets/Code.gs']) existsSync(join(root, f)) ? ok(f) : bad(`${f} is missing from the project`)
existsSync(join(root, 'node_modules')) ? ok('dependencies installed') : bad('Dependencies are missing. Run: npm ci')
existsSync(join(root, 'dist', 'index.html')) ? ok('website is built (dist/)') : warn('website not built yet. Run: npm run build (needed for "npm start")')

try { mkdirSync(dataDir, { recursive: true }); accessSync(dataDir, constants.W_OK); ok(`data folder is writable: ${dataDir}`) } catch { bad(`Cannot write to the data folder: ${dataDir}`) }

const dbFile = join(dataDir, 'eventhub.sqlite')
if (existsSync(dbFile)) {
  try {
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(dbFile)
    const integrity = db.prepare('PRAGMA integrity_check').get().integrity_check
    integrity === 'ok' ? ok(`database integrity: ok (${(statSync(dbFile).size / 1048576).toFixed(1)} MB)`) : bad(`database integrity problem: ${integrity}. Restore a backup copy from the data folder.`)
    const count = (t) => { try { return db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c } catch { return 0 } }
    console.log(`        users ${count('users')}, students ${count('students')}, events ${count('events')}, registrations ${count('registrations')}`)
    if (count('users') === 0) warn('no users yet: open the website and create the first administrator on the setup screen')
    const state = Object.fromEntries((db.prepare("SELECT key,value FROM integration_settings").all?.() ?? []).map((r) => [r.key, r.value]))
    if (state.sheets_url || process.env.GOOGLE_SHEETS_WEBHOOK_URL) ok('Google Sheets is connected (see Admin > Google Sheets for status)')
    else warn('Google Sheets is not connected yet (Admin > Google Sheets)')
    db.close()
  } catch (error) { if (String(error.message).includes('integration_settings')) warn('Google Sheets is not connected yet (Admin > Google Sheets)'); else bad(`Cannot open the database: ${error.message}`) }
  const backups = existsSync(dataDir) ? readdirSync(dataDir).filter((f) => f.endsWith('.sqlite') && f !== 'eventhub.sqlite').length : 0
  if (backups) warn(`${backups} old backup copies are stored in the data folder (safe to move elsewhere)`)
} else warn('no database yet: it is created automatically on first start')

const inUse = await new Promise((resolve) => { const s = net.createServer(); s.once('error', () => resolve(true)); s.once('listening', () => s.close(() => resolve(false))); s.listen(port, '127.0.0.1') })
inUse ? warn(`port ${port} is already in use. If that is EventHub, it is running; otherwise start with EVENTHUB_API_PORT=<another port>`) : ok(`port ${port} is free`)
try { const r = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(2000) }); if (r.ok) ok(`EventHub API is running on port ${port}`) } catch { /* not running */ }

console.log(problems ? `\n${problems} thing(s) to fix (marked FIX).\n` : '\nEverything needed looks good. Start with: npm start\n')
process.exit(problems ? 1 : 0)
