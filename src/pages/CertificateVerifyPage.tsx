import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { apiRequest } from '../lib/api'
type Certificate = { certificate_id: string; type: string; recipient_name: string; event_name: string; issued_at: string }
export default function CertificateVerifyPage() {
  const [params] = useSearchParams()
  const [id, setId] = useState(params.get('id') || '')
  const [certificate, setCertificate] = useState<Certificate | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function verify(event: FormEvent) {
    event.preventDefault()
    if (busy || !id.trim()) return
    setBusy(true); setError(''); setCertificate(null)
    try { const data = await apiRequest(`/api/public/certificates/${encodeURIComponent(id.trim())}`); setCertificate(data.certificate) }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not verify this certificate.') }
    finally { setBusy(false) }
  }
  return <main className="public-section"><span className="eyebrow">Public verification</span><h1>Verify a certificate</h1><p className="lead">Enter the certificate ID shown on your GEMS EventHub certificate.</p><form className="verify-box" onSubmit={verify}><label>Certificate ID<input value={id} onChange={e => { setId(e.target.value); setCertificate(null); setError('') }} placeholder="GEH-…" required maxLength={120}/></label><button className="button button-primary" disabled={busy || !id.trim()}>{busy ? 'Verifying…' : 'Verify certificate'}</button></form>{error && <div className="form-alert error" role="alert">{error}</div>}{certificate && <section className="verification-result" aria-live="polite"><span className="status-pill green">Verified certificate</span><h2>{certificate.recipient_name}</h2><p>{certificate.type} · {certificate.event_name}</p><dl><dt>Certificate ID</dt><dd>{certificate.certificate_id}</dd><dt>Issued</dt><dd>{new Date(certificate.issued_at.replace(' ', 'T') + (certificate.issued_at.endsWith('Z') ? '' : 'Z')).toLocaleDateString('en-IN')}</dd></dl></section>}</main>
}
