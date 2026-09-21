// A tiny in-memory imitation of Google Sheets + Apps Script hosting, used only by the tests.
// It runs the REAL google-sheets/Code.gs, so the test proves the script and the server agree.
import http from 'node:http'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

class Range {
  constructor(sheet, r, c, nr, nc) { Object.assign(this, { sheet, r, c, nr, nc }) }
  getValues() { return Array.from({ length: this.nr }, (_, i) => Array.from({ length: this.nc }, (_, j) => this.sheet.cell(this.r + i, this.c + j))) }
  setValues(values) { values.forEach((row, i) => row.forEach((v, j) => this.sheet.set(this.r + i, this.c + j, v))); return this }
  setNumberFormat() { return this }
  setFontWeight() { return this }
  setBackground() { return this }
  setFontColor() { return this }
}
class Sheet {
  constructor(name) { this.name = name; this.grid = []; this.maxRows = 1000; this.maxCols = 26 }
  getName() { return this.name }
  cell(r, c) { return this.grid[r - 1]?.[c - 1] ?? '' }
  set(r, c, v) { while (this.grid.length < r) this.grid.push([]); const row = this.grid[r - 1]; while (row.length < c) row.push(''); row[c - 1] = v }
  getMaxColumns() { return this.maxCols }
  getMaxRows() { return this.maxRows }
  insertColumnsAfter(_, k) { this.maxCols += k }
  insertRowsAfter(_, k) { this.maxRows += k }
  getRange(r, c, nr = 1, nc = 1) { return new Range(this, r, c, nr, nc) }
  getLastRow() { for (let i = this.grid.length; i > 0; i--) if ((this.grid[i - 1] || []).some((v) => v !== '')) return i; return 0 }
  setFrozenRows() {}
  autoResizeColumns() {}
  deleteRow(n) { this.grid.splice(n - 1, 1) }
  rows() { return this.grid.slice(0, this.getLastRow()).map((r) => r.map(String)) }
}

export function startMockGoogle({ secret = 'test-secret-123' } = {}) {
  const sheets = []
  const spreadsheet = { getName: () => 'GEMS EventHub Data', getUrl: () => 'https://docs.google.com/spreadsheets/d/mock', getSheets: () => sheets, insertSheet: (name) => { const s = new Sheet(name); sheets.push(s); return s } }
  sheets.push(new Sheet('Sheet1'))
  const code = readFileSync(resolve('google-sheets/Code.gs'), 'utf8').replace("var SECRET = 'CHANGE-THIS-TO-A-LONG-RANDOM-TEXT';", `var SECRET = '${secret}';`)
  const context = vm.createContext({
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (content) => ({ content, setMimeType() { return this }, getContent() { return content } }) },
    JSON, String, Math, Array,
  })
  vm.runInContext(code, context)
  const echoes = new Map(); let counter = 0; const calls = []; let failing = false
  const server = http.createServer((req, res) => {
    if (failing) { res.writeHead(500); res.end('Internal error'); return }
    if (req.method === 'POST' && req.url === '/macros/s/mock/exec') {
      let raw = ''
      req.on('data', (c) => { raw += c })
      req.on('end', () => {
        calls.push(JSON.parse(raw))
        const output = context.doPost({ postData: { contents: raw } }).getContent()
        const id = ++counter; echoes.set(id, output) // like Google: POST answers with a redirect to the result
        res.writeHead(302, { Location: `/echo/${id}` }); res.end()
      })
    } else if (req.method === 'GET' && req.url.startsWith('/echo/')) {
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(echoes.get(Number(req.url.split('/')[2])) || '{}')
    } else { res.writeHead(404); res.end() }
  })
  return new Promise((resolveStart) => server.listen(0, '127.0.0.1', () => resolveStart({
    url: `http://127.0.0.1:${server.address().port}/macros/s/mock/exec`, secret, sheets, calls,
    tab: (prefix) => sheets.find((s) => s.getName() === prefix || s.getName().startsWith(`${prefix} `)),
    setFailing: (value) => { failing = value },
    close: () => new Promise((r) => server.close(r)),
  })))
}

// ---------- imitation of the Google Sheets REST API + OAuth token endpoint (service account method) ----------
import { createPublicKey, verify } from 'node:crypto'

export function startMockSheetsApi({ email, publicKeyPem, spreadsheetId = 'MockSpreadsheetId1234567890abcdef', gridRows = 1000 }) {
  const sheets = [new Sheet('Sheet1')]
  let nextId = 1; sheets[0].id = 0
  let shared = false
  const issued = new Set(); const log = []
  const publicKey = createPublicKey(publicKeyPem)
  const listSheet = (s) => ({ properties: { sheetId: s.id, title: s.name, gridProperties: { rowCount: s.maxRows, columnCount: s.maxCols } } })
  const colNum = (letters) => letters.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0)
  const parseRange = (range) => {
    const m = range.match(/^'((?:[^']|'')+)'!(.+)$/); if (!m) throw new Error(`bad range ${range}`)
    const sheet = sheets.find((s) => s.name === m[1].replace(/''/g, "'")); const ref = m[2]
    let x
    if ((x = ref.match(/^([A-Z]+):([A-Z]+)$/))) return { sheet, kind: 'col', c: colNum(x[1]) }
    if ((x = ref.match(/^(\d+):(\d+)$/))) return { sheet, kind: 'row', r: Number(x[1]) }
    if ((x = ref.match(/^([A-Z]+)(\d+)$/))) return { sheet, kind: 'cell', c: colNum(x[1]), r: Number(x[2]) }
    throw new Error(`bad ref ${ref}`)
  }
  const send = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)) }
  const fail = (res, status, message) => send(res, status, { error: { code: status, message } })
  const server = http.createServer((req, res) => {
    let raw = ''
    req.on('data', (c) => { raw += c })
    req.on('end', () => {
      try {
        const url = new URL(req.url, 'http://x')
        if (req.method === 'POST' && url.pathname === '/token') {
          const jwt = new URLSearchParams(raw).get('assertion') || ''; const [h, p, sig] = jwt.split('.')
          const header = JSON.parse(Buffer.from(h, 'base64url')), claim = JSON.parse(Buffer.from(p || '', 'base64url'))
          const good = header.alg === 'RS256' && claim.iss === email && /spreadsheets/.test(claim.scope) && verify('RSA-SHA256', Buffer.from(`${h}.${p}`), publicKey, Buffer.from(sig || '', 'base64url'))
          if (!good) return send(res, 400, { error: 'invalid_grant', error_description: 'Invalid JWT Signature.' })
          const token = `token-${issued.size + 1}`; issued.add(token); return send(res, 200, { access_token: token, expires_in: 3600 })
        }
        const base = `/v4/spreadsheets/${spreadsheetId}`
        if (!url.pathname.startsWith('/v4/spreadsheets/')) return fail(res, 404, 'Not found')
        if (!issued.has((req.headers.authorization || '').replace('Bearer ', ''))) return fail(res, 401, 'Request had invalid authentication credentials.')
        if (!url.pathname.startsWith(base)) return fail(res, 404, 'Requested entity was not found.')
        if (!shared) return fail(res, 403, 'The caller does not have permission')
        const rest = decodeURIComponent(url.pathname.slice(base.length))
        log.push(`${req.method} ${rest.slice(0, 40)}`)
        if (req.method === 'GET' && rest === '') {
          const fields = url.searchParams.get('fields') || ''
          return send(res, 200, fields.includes('sheets') ? { sheets: sheets.map(listSheet) } : { properties: { title: 'GEMS EventHub Data' }, spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit` })
        }
        if (req.method === 'GET' && rest.startsWith('/values/')) {
          const r = parseRange(rest.slice('/values/'.length))
          if (r.kind === 'col') { const last = r.sheet.getLastRow(); const values = []; for (let i = 1; i <= last; i++) { const v = r.sheet.cell(i, r.c); values.push(v === '' ? [] : [String(v)]) } return send(res, 200, values.length ? { values } : {}) }
          if (r.kind === 'row') { const row = (r.sheet.grid[r.r - 1] || []).map(String); while (row.length && row[row.length - 1] === '') row.pop(); return send(res, 200, row.length ? { values: [row] } : {}) }
        }
        if (req.method === 'POST' && rest === '/values:batchUpdate') {
          const body = JSON.parse(raw); if (body.valueInputOption !== 'RAW') return fail(res, 400, 'valueInputOption required')
          for (const entry of body.data) {
            const r = parseRange(entry.range)
            entry.values.forEach((row, i) => row.forEach((v, j) => {
              const rr = r.r + i, cc = r.c + j
              if (rr > r.sheet.maxRows || cc > r.sheet.maxCols) throw Object.assign(new Error(`Range (${r.sheet.name}!${rr}:${cc}) exceeds grid limits.`), { status: 400 })
              r.sheet.set(rr, cc, v)
            }))
          }
          return send(res, 200, { totalUpdatedRows: 1 })
        }
        if (req.method === 'POST' && rest === ':batchUpdate') {
          const replies = []
          for (const rq of JSON.parse(raw).requests) {
            if (rq.addSheet) { const s = new Sheet(rq.addSheet.properties.title); s.id = nextId++; s.maxRows = gridRows; sheets.push(s); replies.push({ addSheet: listSheet(s) }) }
            else if (rq.appendDimension) { const s = sheets.find((x) => x.id === rq.appendDimension.sheetId); if (rq.appendDimension.dimension === 'ROWS') s.maxRows += rq.appendDimension.length; else s.maxCols += rq.appendDimension.length; replies.push({}) }
            else if (rq.deleteDimension) { const d = rq.deleteDimension.range; sheets.find((x) => x.id === d.sheetId).grid.splice(d.startIndex, d.endIndex - d.startIndex); replies.push({}) }
            else replies.push({}) // formatting requests
          }
          return send(res, 200, { replies })
        }
        return fail(res, 404, `Unhandled ${req.method} ${rest}`)
      } catch (error) { return fail(res, error.status || 500, error.message) }
    })
  })
  return new Promise((resolveStart) => server.listen(0, '127.0.0.1', () => {
    const origin = `http://127.0.0.1:${server.address().port}`
    resolveStart({ apiBase: `${origin}/v4/spreadsheets`, tokenUrl: `${origin}/token`, spreadsheetId, sheets, log, share: () => { shared = true },
      tab: (prefix) => sheets.find((s) => s.name === prefix || s.name.startsWith(`${prefix} `)), close: () => new Promise((r) => server.close(r)) })
  }))
}
