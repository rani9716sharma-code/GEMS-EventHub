import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useResource } from '../hooks/useResource'
import LoadState from '../components/LoadState'
type Event = { id: number; name: string; event_date: string; start_time: string; venue: string; status: string }
export default function DepartmentCalendarPage() {
  const { token, user } = useAuth()
  const resource = useResource<{ rows: Event[] }>('/api/events/manage', token)
  const [month, setMonth] = useState('')
  const rows = (resource.data?.rows || []).filter(e => !month || e.event_date.startsWith(month)).sort((a, b) => `${a.event_date}${a.start_time}`.localeCompare(`${b.event_date}${b.start_time}`))
  return <section className="portal-content"><div className="page-toolbar"><div><span className="eyebrow">{user?.department} department</span><h2>Event Calendar</h2><p>Published activities and proposals awaiting review.</p></div><label>Filter by month<input type="month" value={month} onChange={e => setMonth(e.target.value)}/></label></div><LoadState {...resource} retry={resource.reload}/>{!resource.loading && !resource.error && (rows.length ? <div className="calendar-agenda">{rows.map(e => <article key={e.id}><time dateTime={e.event_date}>{new Date(`${e.event_date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</time><div><h3>{e.name}</h3><p>{e.start_time} · {e.venue}</p></div><span className="status-pill">{e.status}</span>{e.status === 'Submitted' && <Link className="button button-ghost" to="/hod/approvals">Review proposal</Link>}</article>)}</div> : <div className="empty-state"><h3>No events in this period</h3><p>Change the month filter to see other department activities.</p></div>)}</section>
}
