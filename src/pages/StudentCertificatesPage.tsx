import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useResource } from '../hooks/useResource'
import LoadState from '../components/LoadState'
import { assetUrl, appPath } from '../lib/paths'
type Certificate = { id: number; certificate_id: string; type: string; event_name: string; issued_at: string }
export default function StudentCertificatesPage() {
  const { token, user } = useAuth()
  const resource = useResource<{ rows: Certificate[] }>('/api/certificates/my', token)
  const [selected, setSelected] = useState<Certificate | null>(null)
  useEffect(() => {
    if (!selected) return
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const trap = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelected(null)
      if (event.key !== 'Tab') return
      const controls = Array.from(document.querySelectorAll<HTMLButtonElement>('.certificate-controls button'))
      const first = controls[0], last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', trap)
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', trap); previous?.focus() }
  }, [selected])
  return <section className="portal-content"><div className="page-toolbar"><div><span className="eyebrow">Credentials</span><h2>My Certificates</h2><p>View, print or verify your issued certificates.</p></div><button className="button button-ghost" onClick={resource.reload}>Refresh</button></div><LoadState {...resource} retry={resource.reload}/>{!resource.loading && !resource.error && (resource.data?.rows.length ? <div className="certificate-list">{resource.data.rows.map(c => <article key={c.id}><div><small>{c.type}</small><h3>{c.event_name}</h3><p>Certificate ID: <b>{c.certificate_id}</b></p></div><div className="heading-actions"><button className="button button-primary" onClick={() => setSelected(c)}>View certificate</button><Link className="button button-ghost" to={`/verify?id=${encodeURIComponent(c.certificate_id)}`}>Verify</Link></div></article>)}</div> : <div className="empty-state"><h3>No certificates issued yet</h3><p>Certificates appear here after your event coordinator issues them.</p></div>)}{selected && <div className="certificate-overlay" role="dialog" aria-modal="true" aria-label="Certificate" onKeyDown={e => { if (e.key === 'Escape') setSelected(null) }}><div className="certificate-document"><img src={assetUrl('/assets/gems-logo.png')} alt="GEMS Polytechnic College"/><p>GEMS POLYTECHNIC COLLEGE</p><h2>Certificate of Achievement</h2><p>This certificate is awarded to</p><h1>{user?.name}</h1><p>for <strong>{selected.type}</strong> in</p><h3>{selected.event_name}</h3><p>Issued {selected.issued_at.slice(0, 10)}</p><footer><strong>{selected.certificate_id}</strong><span>Verify at {window.location.origin}{appPath('/verify')}</span></footer><div className="certificate-controls"><button className="button button-primary" onClick={() => window.print()}>Print / Save PDF</button><button className="button button-ghost" autoFocus onClick={() => setSelected(null)}>Close</button></div></div></div>}</section>
}
