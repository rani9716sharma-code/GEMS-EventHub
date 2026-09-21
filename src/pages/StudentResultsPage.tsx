import { useAuth } from '../auth/AuthContext'
import { useResource } from '../hooks/useResource'
import LoadState from '../components/LoadState'
type Result = { id: number; event_name: string; category: string; award: string; position?: number; points_awarded: number }
export default function StudentResultsPage() {
  const { token } = useAuth()
  const resource = useResource<{ rows: Result[] }>('/api/results/my', token)
  return <section className="portal-content"><div className="page-toolbar"><div><span className="eyebrow">Official outcomes</span><h2>My Results</h2><p>Your published awards and achievement points.</p></div><button className="button button-ghost" onClick={resource.reload}>Refresh</button></div><LoadState {...resource} retry={resource.reload}/>{!resource.loading && !resource.error && (resource.data?.rows.length ? <div className="result-card-grid">{resource.data.rows.map(r => <article key={r.id}><span>{r.category}</span><h3>{r.event_name}</h3><b>{r.award}</b><p>{r.position ? `Position #${r.position} · ` : ''}{r.points_awarded} points</p></article>)}</div> : <div className="empty-state"><h3>No published results yet</h3><p>Your results appear after an event coordinator publishes them.</p></div>)}</section>
}
