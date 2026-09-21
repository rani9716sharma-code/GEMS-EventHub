import { FormEvent, useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { apiRequest } from '../lib/api'

type SheetInfo = { key: string; title: string; rows: number; synced: number }
type Status = {
  connected: boolean; enabled: boolean; source: 'environment' | 'settings' | null; mode: 'script' | 'api' | null; host: string; urlTail: string
  serviceEmail: string; spreadsheetTail: string
  running: boolean; pending: number | null; lastRunAt: string | null; lastSuccessAt: string | null; lastError: string | null
  sheets: SheetInfo[]
}

function when(value: string | null) {
  if (!value) return 'Never'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function AdminSheetsPage() {
  const { token } = useAuth()
  const [status, setStatus] = useState<Status | null>(null)
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [mode, setMode] = useState<'script' | 'api'>('api')
  const [url, setUrl] = useState('')
  const [secret, setSecret] = useState('')
  const [sheetLink, setSheetLink] = useState('')
  const [keyJson, setKeyJson] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [showSetup, setShowSetup] = useState(false)
  const auth = { Authorization: `Bearer ${token}` }

  const call = useCallback(async <T,>(path: string, options: RequestInit = {}) => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 180000)
    try { return await apiRequest<T>(path, { ...options, headers: auth, signal: controller.signal }) }
    finally { window.clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const load = useCallback(async () => {
    try { const data = await call<Status & { ok: boolean }>('/api/admin/sheets/status'); setStatus(data); setEnabled(data.enabled || !data.connected); if (data.mode) setMode(data.mode); setLoadError('') }
    catch (error: any) { setLoadError(error.message || 'Could not load the Google Sheets status.') }
  }, [call])

  useEffect(() => { if (token) void load() }, [token, load])
  useEffect(() => { // keep the status fresh while a sync may be running
    if (!token) return
    const timer = window.setInterval(() => { void load() }, 15000)
    return () => window.clearInterval(timer)
  }, [token, load])

  async function run(name: string, action: () => Promise<void>) {
    setBusy(name); setMessage(null)
    try { await action() } catch (error: any) { setMessage({ kind: 'error', text: error.message || 'Something went wrong.' }); await load() } finally { setBusy('') }
  }

  const save = (event: FormEvent) => { event.preventDefault(); void run('save', async () => {
    const data = await call<Status & { test: { ok: boolean; error?: string; spreadsheet?: string } }>('/api/admin/sheets/config', { method: 'PATCH', body: JSON.stringify({ mode, url, secret, sheetLink, serviceAccountJson: keyJson, enabled }) })
    setStatus(data); setSecret(''); setKeyJson('')
    setMessage(data.test.ok ? { kind: 'success', text: `Connected to “${data.test.spreadsheet}”. The first sync has started.` } : { kind: 'error', text: `Saved, but Google did not accept the connection: ${data.test.error}` })
  }) }

  const syncNow = (full: boolean) => run(full ? 'full' : 'sync', async () => {
    const data = await call<Status & { result: { rowsSent?: number; rowsRemoved?: number; skipped?: boolean } }>('/api/admin/sheets/sync', { method: 'POST', body: JSON.stringify({ full }) })
    setStatus(data)
    setMessage({ kind: 'success', text: data.result.skipped ? 'Nothing to sync.' : `Sync complete: ${data.result.rowsSent ?? 0} row(s) written to Google Sheets.` })
  })
  const test = () => run('test', async () => {
    const data = await call<{ ok: boolean; error?: string; spreadsheet?: string }>('/api/admin/sheets/test', { method: 'POST' })
    setMessage(data.ok ? { kind: 'success', text: `Connection works. Spreadsheet: “${data.spreadsheet}”.` } : { kind: 'error', text: data.error || 'Connection failed.' })
  })
  const disconnect = () => { if (!window.confirm('Disconnect Google Sheets? Your database is not affected and existing sheet data stays in Google.')) return; void run('disconnect', async () => {
    const data = await call<Status>('/api/admin/sheets/config', { method: 'DELETE' }); setStatus(data); setUrl(''); setMessage({ kind: 'success', text: 'Google Sheets disconnected.' })
  }) }
  const readKeyFile = (file?: File | null) => { if (!file) return; const reader = new FileReader(); reader.onload = () => setKeyJson(String(reader.result || '')); reader.readAsText(file) }
  const copyEmail = async () => { if (status?.serviceEmail) { await navigator.clipboard.writeText(status.serviceEmail); setMessage({ kind: 'success', text: 'Service account e-mail copied. Share your Google Sheet with it as Editor.' }) } }
  const copyScript = () => run('script', async () => {
    const data = await call<{ script: string }>('/api/admin/sheets/script')
    await navigator.clipboard.writeText(data.script)
    setMessage({ kind: 'success', text: 'Script copied. Paste it into Extensions > Apps Script in your Google Sheet.' })
  })

  const connected = Boolean(status?.connected)
  const locked = status?.source === 'environment'

  return <section className="portal-content admin-sheets-page">
    <div className="page-toolbar">
      <div>
        <span className="eyebrow">Data sync</span>
        <h2>Google Sheets</h2>
        <p>Keep a live copy of all users, students, events and event registrations in your own Google Sheet. Each event gets its own tab.</p>
      </div>
      <span className={`status-pill ${connected && status?.enabled ? 'status-active' : 'status-draft'}`}>{connected ? (status?.enabled ? 'Connected' : 'Paused') : 'Not connected'}</span>
    </div>

    {loadError && <div className="form-alert error" role="alert">{loadError}</div>}
    {message && <div className={`form-alert ${message.kind}`} role={message.kind === 'error' ? 'alert' : 'status'}>{message.text}</div>}
    {status?.lastError && <div className="form-alert warning" role="alert"><b>Last sync problem:</b> {status.lastError} The data is safe in the database and will be retried automatically.</div>}

    {connected && <div className="panel sheets-status-panel">
      <div className="student-stat-grid sheets-stats">
        <article className="student-stat"><span>Last successful sync</span><strong className="sheets-when">{when(status!.lastSuccessAt)}</strong><small>{status!.running ? 'Syncing now…' : 'Automatic after every change'}</small></article>
        <article className="student-stat"><span>Waiting to sync</span><strong>{status!.pending ?? '–'}</strong><small>rows changed since last sync</small></article>
        <article className="student-stat"><span>Connection</span><strong className="sheets-when">{status!.mode === 'api' ? 'Sheet link' : 'Apps Script'}</strong><small>{locked ? 'Set by server settings' : status!.mode === 'api' ? `Sheet ${status!.spreadsheetTail}` : `URL ends ${status!.urlTail}`}</small></article>
      </div>
      <div className="form-actions">
        <button className="button button-primary" disabled={Boolean(busy)} onClick={() => syncNow(false)}>{busy === 'sync' ? 'Syncing…' : 'Sync now'}</button>
        <button className="button button-ghost" disabled={Boolean(busy)} onClick={() => syncNow(true)} title="Send every row again (use if someone deleted a tab or rows in the sheet)">{busy === 'full' ? 'Resyncing…' : 'Full resync'}</button>
        <button className="button button-ghost" disabled={Boolean(busy)} onClick={test}>{busy === 'test' ? 'Testing…' : 'Test connection'}</button>
        {!locked && <button className="button button-danger" disabled={Boolean(busy)} onClick={disconnect}>Disconnect</button>}
      </div>
      {status!.sheets.length > 0 && <div className="table-scroll"><table className="student-table">
        <thead><tr><th>Sheet tab</th><th>Rows in EventHub</th><th>Rows in Google Sheet</th></tr></thead>
        <tbody>{status!.sheets.map(s => <tr key={s.key}><td><strong>{s.title}</strong></td><td>{s.rows}</td><td>{s.synced}{s.synced < s.rows && <span className="status-pill status-pending sheets-behind">Syncing</span>}</td></tr>)}</tbody>
      </table></div>}
    </div>}

    {!locked && <form className="panel sheets-connect" onSubmit={save}>
      <div className="section-heading compact"><div><span className="eyebrow">{connected ? 'Change connection' : 'Connect'}</span><h3>{connected ? 'Update the connection' : 'Connect your Google Sheet'}</h3></div>
        <button type="button" className="text-link" onClick={() => setShowSetup(!showSetup)}>{showSetup ? 'Hide' : 'Show'} setup steps</button></div>
      <div className="choice-grid" role="radiogroup" aria-label="Connection method">
        <button type="button" role="radio" aria-checked={mode === 'api'} className={`choice-card ${mode === 'api' ? 'active' : ''}`} onClick={() => setMode('api')}><b>Sheet link + service account</b><span>Paste the link of your Google Sheet and a key file. No code to paste.</span></button>
        <button type="button" role="radio" aria-checked={mode === 'script'} className={`choice-card ${mode === 'script' ? 'active' : ''}`} onClick={() => setMode('script')}><b>Google Apps Script</b><span>Paste a small script into the sheet. No Google Cloud needed.</span></button>
      </div>

      {mode === 'api' && <>
        {(showSetup || !connected) && <ol className="sheets-steps">
          <li>Open <b>console.cloud.google.com</b>, create a project, then open <b>APIs &amp; Services › Library</b>, search <b>Google Sheets API</b> and click <b>Enable</b>.</li>
          <li>Go to <b>IAM &amp; Admin › Service Accounts › Create service account</b> (any name, e.g. <code>eventhub</code>) and click Done.</li>
          <li>Open that service account › <b>Keys › Add key › Create new key › JSON</b>. A <code>.json</code> file downloads.</li>
          <li>Choose that file below (or paste its text) and click <b>Save</b>. EventHub then shows the service account e-mail.</li>
          <li>Open your Google Sheet › <b>Share</b> › add that e-mail as <b>Editor</b>, paste the sheet link below and click <b>Save and connect</b> again.</li>
        </ol>}
        <div className="form-grid">
          <label className="form-span">Google Sheet link<input value={sheetLink} onChange={e => setSheetLink(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…/edit" required={!connected || status?.mode !== 'api'} autoComplete="off" /></label>
          <label className="form-span">Service account key (JSON)<textarea className="sheets-key" value={keyJson} onChange={e => setKeyJson(e.target.value)} rows={5} spellCheck={false} placeholder={status?.mode === 'api' ? 'A key is saved. Paste a new one only to replace it.' : '{ "type": "service_account", "client_email": "…", "private_key": "…" }'} required={status?.mode !== 'api'} /></label>
          <label className="form-span">…or choose the downloaded .json file<input type="file" accept=".json,application/json" onChange={e => readKeyFile(e.target.files?.[0])} /></label>
        </div>
        {status?.mode === 'api' && status.serviceEmail && <div className="form-alert info"><b>Share your Google Sheet with:</b> <code>{status.serviceEmail}</code> <button type="button" className="text-link" onClick={copyEmail}>Copy e-mail</button> (permission: Editor)</div>}
      </>}

      {mode === 'script' && <>
        {(showSetup || !connected) && <ol className="sheets-steps">
          <li>Create a Google Sheet (or open an existing one), then choose <b>Extensions › Apps Script</b>.</li>
          <li>Delete the code shown there and paste the EventHub script. <button type="button" className="text-link" disabled={Boolean(busy)} onClick={copyScript}>Copy the script</button></li>
          <li>In the script, change <code>SECRET</code> to a long private text (12+ characters) and save.</li>
          <li>Click <b>Deploy › New deployment › Web app</b>. Set <b>Execute as: Me</b> and <b>Who has access: Anyone</b>, then Deploy and allow access.</li>
          <li>Copy the <b>Web app URL</b> (ends with <code>/exec</code>) and paste it below with the same secret.</li>
        </ol>}
        <div className="form-grid">
          <label className="form-span">Web app URL<input type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec" required={!connected || status?.mode !== 'script'} autoComplete="off" /></label>
          <label>Secret<input type="password" value={secret} onChange={e => setSecret(e.target.value)} placeholder={status?.mode === 'script' ? 'Leave empty to keep the saved secret' : 'Same text as SECRET in the script'} required={status?.mode !== 'script'} minLength={status?.mode === 'script' ? 0 : 8} autoComplete="off" /></label>
        </div>
      </>}

      <div className="form-grid"><label className="sheets-toggle"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} /><span>Sync automatically</span></label></div>
      <div className="form-actions"><button className="button button-primary" disabled={Boolean(busy)}>{busy === 'save' ? 'Connecting…' : connected ? 'Save changes' : mode === 'api' ? 'Save and connect' : 'Save and connect'}</button></div>
    </form>}

    <div className="panel sheets-info">
      <h3>What is saved</h3>
      <ul>
        <li><b>Users</b> and <b>Students</b>: names, roles, departments, IDs, emails and phone numbers. Passwords are never sent.</li>
        <li><b>Events</b>: one row per event with capacity, status and live registration counts.</li>
        <li><b>One tab per event</b> (named with the event code): every registration with payment, attendance and result.</li>
        <li><b>All Registrations</b>: the same registrations from every event in one tab, good for filters and charts.</li>
      </ul>
      <p className="helper-text">EventHub is the master copy. Edit data in EventHub, not in the sheet: changes made in the sheet are overwritten by the next sync. Add your own columns to the right of the existing ones, or make a copy of a tab for analysis. Anyone with access to the sheet can see this personal data, so share it carefully.</p>
    </div>
  </section>
}
