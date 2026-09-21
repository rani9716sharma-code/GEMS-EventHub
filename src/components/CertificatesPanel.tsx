import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { apiRequest } from '../lib/api'
import { useResource } from '../hooks/useResource'
import LoadState from './LoadState'

type Certificate = { certificate_id: string; recipient_name: string; type: string; issued_at: string }
export default function CertificatesPanel({ eventId }: { eventId: number }) {
  const { token } = useAuth()
  const records = useResource<{rows: Certificate[]}>(`/api/coordinator/certificates?event_id=${eventId}`, token)
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('')
  async function issue() {
    if (busy) return
    setBusy(true); setError(''); setMessage('')
    try {
      const result = await apiRequest('/api/coordinator/certificates', {method:'POST',headers:{Authorization:`Bearer ${token}`},body:JSON.stringify({event_id:eventId})})
      setMessage(result.message); records.reload()
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not issue certificates.') }
    finally { setBusy(false) }
  }
  return <section className="page-stack"><div className="page-toolbar"><div><h3>Event certificates</h3><p>Issue certificates for published results. Existing certificates are preserved; students can view and print them from their portal.</p></div><button className="button button-primary" disabled={busy} onClick={issue}>{busy?'Issuing…':'Issue certificates'}</button></div>
    {error&&<p className="form-alert error" role="alert">{error}</p>}{message&&<p className="form-alert success" role="status">{message}</p>}
    <LoadState loading={records.loading} error={records.error} retry={records.reload}/>
    {!records.loading&&!records.error&&(records.data?.rows.length?<div className="table-wrap"><table><thead><tr><th>Recipient</th><th>Award</th><th>Certificate ID</th><th>Verification</th></tr></thead><tbody>{records.data.rows.map(row=><tr key={row.certificate_id}><td>{row.recipient_name}</td><td>{row.type}</td><td>{row.certificate_id}</td><td><Link to={`/verify?id=${encodeURIComponent(row.certificate_id)}`}>Verify</Link></td></tr>)}</tbody></table></div>:<div className="empty-state">No certificates issued for this event yet.</div>)}
  </section>
}
