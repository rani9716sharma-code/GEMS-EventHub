import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { API, useAuth } from '../auth/AuthContext'

type EventRow={id:number;event_code:string;name:string;category:string;organizing_department:string;event_date:string;start_time:string;venue:string;status:string;participation_type?:string}
type TeamRow={id:number;status:string}

export default function CoordinatorDashboard() {
  const {token,user}=useAuth();const [events,setEvents]=useState<EventRow[]>([]);const [teams,setTeams]=useState<TeamRow[]>([]);const [loading,setLoading]=useState(true);const [error,setError]=useState('')
  useEffect(()=>{(async()=>{try{const er=await fetch(`${API}/api/events/manage`,{headers:{Authorization:`Bearer ${token}`}});const ed=await er.json();if(!er.ok)throw new Error(ed.error || 'Could not load events');setEvents(ed.rows||[]);const tr=await fetch(`${API}/api/teams/manage`,{headers:{Authorization:`Bearer ${token}`}});const td=await tr.json();if(!tr.ok)throw new Error(td.error || 'Could not load teams');setTeams(td.rows||[])}catch(error){setError(error instanceof Error ? error.message : 'Could not load dashboard')}finally{setLoading(false)}})()},[token])
  const stats=useMemo(()=>({events:events.length,pending:events.filter(e=>['Submitted','Changes Requested'].includes(e.status)).length,live:events.filter(e=>['Published','Registration Open','Ongoing'].includes(e.status)).length,teams:teams.length,teamPending:teams.filter(t=>t.status==='Pending').length}),[events,teams])
  const upcoming=events.filter(e=>new Date(`${e.event_date}T23:59:59`)>=new Date()).sort((a,b)=>a.event_date.localeCompare(b.event_date)).slice(0,4)
  const next=upcoming[0]
  return <section className="portal-content coordinator-home">
    {error && <div className="form-alert error" role="alert">{error}<button onClick={()=>window.location.reload()}>Try again</button></div>}
    <div className="coord-hero">
      <div className="coord-hero-copy"><span className="eyebrow light">Coordinator Workspace</span><h2>Good to see you, {user?.name?.split(' ')[0]}.</h2><p>Run registrations, teams, payments, check-in and results from a single event workspace.</p><div className="coord-hero-actions"><Link className="button button-light" to="/coordinator/events/create">＋ Create Event</Link><Link className="button button-outline-light" to="/coordinator/scanner">▣ Scan College ID</Link></div></div>
      <div className="coord-next-card"><span>NEXT EVENT</span>{next?<><b>{next.name}</b><p>{new Date(`${next.event_date}T00:00:00`).toLocaleDateString('en-IN',{day:'2-digit',month:'short'})} • {next.start_time} • {next.venue}</p><Link to={`/coordinator/events/${next.id}`}>Open Control Center →</Link></>:<><b>No upcoming event</b><p>Create or publish an event to see it here.</p><Link to="/coordinator/events/create">Create Event →</Link></>}</div>
    </div>

    <div className="coord-metric-grid">
      <article><div className="metric-symbol">◇</div><div><small>MY EVENTS</small><strong>{loading?'—':stats.events}</strong><span>{stats.live} live / published</span></div></article>
      <article><div className="metric-symbol">⌛</div><div><small>EVENT ACTIONS</small><strong>{loading?'—':stats.pending}</strong><span>approval / changes</span></div></article>
      <article><div className="metric-symbol">◉</div><div><small>TEAMS</small><strong>{loading?'—':stats.teams}</strong><span>{stats.teamPending} awaiting review</span></div></article>
      <article><div className="metric-symbol">▣</div><div><small>CHECK-IN</small><strong>Ready</strong><span>college ID scanner</span></div></article>
    </div>

    <div className="coord-main-grid">
      <div className="coord-card"><div className="coord-card-head"><div><span className="eyebrow">Event operations</span><h3>Upcoming Events</h3></div><Link to="/coordinator/events">View all →</Link></div>{upcoming.length===0?<div className="coord-empty"><span>◇</span><b>No upcoming events yet</b><p>Create your first competition or workshop.</p></div>:<div className="coord-event-list">{upcoming.map(e=><Link key={e.id} to={`/coordinator/events/${e.id}`}><div className="coord-date"><b>{new Date(`${e.event_date}T00:00:00`).toLocaleDateString('en-IN',{day:'2-digit'})}</b><span>{new Date(`${e.event_date}T00:00:00`).toLocaleDateString('en-IN',{month:'short'})}</span></div><div><div className="coord-event-tags"><span>{e.category}</span><span>{e.participation_type||'Individual'}</span></div><h4>{e.name}</h4><p>{e.start_time} • {e.venue}</p></div><span className={`event-status status-${e.status.toLowerCase().replaceAll(' ','-')}`}>{e.status}</span><i>›</i></Link>)}</div>}</div>
      <div className="coord-side-stack">
        <div className="coord-card"><div className="coord-card-head"><div><span className="eyebrow">Fast access</span><h3>Quick Actions</h3></div></div><div className="coord-action-list"><Link to="/coordinator/events/create"><span>＋</span><div><b>Create Event</b><small>Start a new event wizard</small></div><i>›</i></Link><Link to="/coordinator/teams"><span>◉</span><div><b>Review Teams</b><small>{stats.teamPending} waiting for review</small></div><i>›</i></Link><Link to="/coordinator/scanner"><span>▣</span><div><b>College ID Scanner</b><small>Verify students on event day</small></div><i>›</i></Link><Link to="/coordinator/events"><span>◇</span><div><b>My Events</b><small>Open an Event Control Center</small></div><i>›</i></Link></div></div>
        <div className="coord-card coord-tip"><span className="tip-icon">✦</span><div><small>EVENTHUB TIP</small><b>Use the Control Center</b><p>Open an event once, then manage teams, participants, payments, attendance and results from the same workspace.</p></div></div>
      </div>
    </div>
  </section>
}
