import { useState } from 'react'
import { useResource } from '../hooks/useResource'
import LoadState from '../components/LoadState'
type Result = { id: number; event_name: string; participant_name: string; award: string; position: number | null; department: string; category: string }
export default function PublicResultsPage() {
  const resource = useResource<{ rows: Result[] }>('/api/public/results')
  const [query, setQuery] = useState('')
  const rows = (resource.data?.rows || []).filter(r => `${r.event_name} ${r.participant_name} ${r.department}`.toLowerCase().includes(query.toLowerCase()))
  return <main className="public-section"><span className="eyebrow">Official outcomes</span><h1>Results & achievements</h1><p className="lead">Published results from college events, reviewed by event coordinators.</p><label className="resource-search">Find a result<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Event, participant or department"/></label><LoadState {...resource} retry={resource.reload}/>{!resource.loading && !resource.error && (rows.length ? <div className="result-card-grid">{rows.map(r => <article key={r.id}><span>{r.category || 'College event'}</span><h2>{r.event_name}</h2><h3>{r.participant_name}</h3><p>{r.department}</p><strong className="result-award">{r.award}{r.position ? ` · Position ${r.position}` : ''}</strong></article>)}</div> : <div className="empty-state"><h3>{query ? 'No results match your search' : 'No published results yet'}</h3><p>{query ? 'Try an event name or another participant.' : 'Results appear here after an event coordinator publishes them.'}</p></div>)}</main>
}
