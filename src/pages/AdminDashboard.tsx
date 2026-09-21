import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { API, useAuth } from '../auth/AuthContext'

type Summary={events:number;students:number;registrations:number;teams:number;payments:number;results:number}
type EventRow={id:number;event_code:string;name:string;category:string;organizing_department:string;event_date:string;start_time:string;venue:string;status:string;payment_type?:string;fee?:number}

const modules=[
  ['Events','Create, approve, publish and operate events.','/admin/events','▣'],
  ['Students','Master directory, bulk import and promotion.','/admin/students','◉'],
  ['Users & Roles','Control administrators, HODs and coordinators.','/admin/users','♙'],
  ['Departments','Manage academic departments and ownership.','/admin/departments','◇'],
  ['Venues','Halls, labs, classrooms and event spaces.','/admin/venues','⌖'],
  ['Reports','Event, payment, attendance and achievement reports.','/admin/reports','↗'],
]

export default function AdminDashboard(){
  const {token,user}=useAuth()
  const [summary,setSummary]=useState<Summary>({events:0,students:0,registrations:0,teams:0,payments:0,results:0})
  const [events,setEvents]=useState<EventRow[]>([])
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')

  useEffect(()=>{(async()=>{try{
    const [sr,er]=await Promise.all([
      fetch(`${API}/api/dashboard/summary`,{headers:{Authorization:`Bearer ${token}`}}),
      fetch(`${API}/api/events/manage`,{headers:{Authorization:`Bearer ${token}`}})
    ])
    const [sd,ed]=await Promise.all([sr.json(),er.json()])
    if(!sr.ok) throw new Error(sd.error||'Could not load dashboard summary.')
    setSummary(sd.summary||summary)
    if(er.ok) setEvents(ed.rows||[])
  }catch(e){setError(e instanceof Error?e.message:'Could not load dashboard.')}finally{setLoading(false)}})()},[token])

  const upcoming=useMemo(()=>events.filter(e=>e.event_date&&new Date(`${e.event_date}T23:59:59`)>=new Date()).sort((a,b)=>a.event_date.localeCompare(b.event_date)).slice(0,5),[events])
  const pending=events.filter(e=>['Submitted','Changes Requested'].includes(e.status)).length
  const live=events.filter(e=>['Published','Registration Open','Ongoing'].includes(e.status)).length
  const firstName=user?.name?.split(' ')[0]||'Admin'

  return <section className="portal-content modern-dashboard">
    <div className="dashboard-welcome">
      <div><span className="eyebrow light">COLLEGE EVENT COMMAND CENTER</span><h2>Good evening, {firstName}.</h2><p>Monitor EventHub activity, manage operations and act on what needs attention — all from one workspace.</p><div className="welcome-actions"><Link className="button button-light" to="/admin/events/create">＋ Create Event</Link><Link className="button button-outline-light" to="/admin/events">Manage Events</Link></div></div>
      <div className="dashboard-health"><span className="health-dot"/><div><small>SYSTEM STATUS</small><b>EventHub is operational</b><p>Live data • role-protected access</p></div></div>
    </div>

    {error&&<div className="form-alert error">{error}</div>}

    <div className="executive-metrics">
      <Link to="/admin/events"><span className="metric-badge">▣</span><div><small>Total events</small><strong>{loading?'—':summary.events}</strong><p>{live} currently live / published</p></div><i>↗</i></Link>
      <Link to="/admin/students"><span className="metric-badge">◉</span><div><small>Students</small><strong>{loading?'—':summary.students}</strong><p>Student directory records</p></div><i>↗</i></Link>
      <Link to="/admin/events"><span className="metric-badge">✓</span><div><small>Registrations</small><strong>{loading?'—':summary.registrations}</strong><p>Across all EventHub events</p></div><i>↗</i></Link>
      <Link to="/admin/reports"><span className="metric-badge">₹</span><div><small>Paid transactions</small><strong>{loading?'—':summary.payments}</strong><p>Verified payment records</p></div><i>↗</i></Link>
    </div>

    <div className="dashboard-workspace-grid">
      <section className="surface-card dashboard-events-panel">
        <div className="surface-head"><div><span className="eyebrow">LIVE OPERATIONS</span><h3>Upcoming Events</h3></div><Link to="/admin/events">View all →</Link></div>
        {upcoming.length?<div className="modern-event-list">{upcoming.map(e=>{
          const d=new Date(`${e.event_date}T00:00:00`)
          return <Link to="/admin/events" key={e.id}><div className="date-tile"><b>{d.toLocaleDateString('en-IN',{day:'2-digit'})}</b><span>{d.toLocaleDateString('en-IN',{month:'short'})}</span></div><div className="event-list-copy"><small>{e.event_code} • {e.category}</small><h4>{e.name}</h4><p>{e.start_time} • {e.venue} • {e.organizing_department}</p></div><span className={`event-status status-${e.status.toLowerCase().replaceAll(' ','-')}`}>{e.status}</span><i>›</i></Link>})}</div>:<div className="modern-empty"><span>◇</span><b>No upcoming events</b><p>Create an event and it will appear here automatically.</p><Link to="/admin/events/create">Create Event →</Link></div>}
      </section>

      <aside className="dashboard-side-column">
        <section className="surface-card attention-card"><div className="surface-head"><div><span className="eyebrow">ATTENTION</span><h3>Action Center</h3></div></div><div className="action-center-list"><Link to="/admin/events"><span>⌛</span><div><b>{pending} event actions</b><small>Submitted or changes requested</small></div><i>›</i></Link><Link to="/admin/events"><span>●</span><div><b>{live} active events</b><small>Published, open or ongoing</small></div><i>›</i></Link><Link to="/admin/users"><span>♙</span><div><b>User access</b><small>Manage roles and permissions</small></div><i>›</i></Link></div></section>
        <section className="surface-card quick-launch"><div className="surface-head"><div><span className="eyebrow">QUICK LAUNCH</span><h3>Common Tasks</h3></div></div><div className="quick-launch-grid"><Link to="/admin/events/create">＋<span>Create Event</span></Link><Link to="/admin/students">◉<span>Add Student</span></Link><Link to="/admin/users">♙<span>Create User</span></Link><Link to="/admin/reports">↗<span>Reports</span></Link></div></section>
      </aside>
    </div>

    <section className="dashboard-modules"><div className="surface-head"><div><span className="eyebrow">WORKSPACE</span><h3>Administration</h3></div><span className="section-note">Everything connected to real EventHub records</span></div><div className="modern-module-grid">{modules.map(([t,d,h,i])=><Link to={h} key={t}><span>{i}</span><div><h4>{t}</h4><p>{d}</p></div><i>→</i></Link>)}</div></section>
  </section>
}
