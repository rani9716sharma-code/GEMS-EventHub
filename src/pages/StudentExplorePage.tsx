import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { API, useAuth } from '../auth/AuthContext'

type EventRow={id:number;status:string;event_code:string;name:string;description?:string|null;category:string;organizing_department:string;event_scope:string;event_date:string;start_time:string;end_time?:string|null;venue:string;capacity?:number|null;seats_used:number;seats_remaining?:number|null;registration_open_now:boolean;participation_type:string;payment_type:string;fee:number;team_min?:number|null;team_max?:number|null;registration_deadline?:string|null;rules?:string|null;requirements?:string|null;prizes?:string|null;contact_info?:string|null;registration_approval_required?:boolean;online_payment?:boolean;offline_payment?:boolean;poster_url?:string|null}
type Team={id:number;event_id:number;team_name:string;team_code:string;status:string}
type Registration={id:number;status:string;event:{id:number}}

export default function StudentExplorePage(){
  const {token}=useAuth()
  const [searchParams]=useSearchParams()
  const selectedEventId=Number(searchParams.get('event')||0)
  const [events,setEvents]=useState<EventRow[]>([])
  const [teams,setTeams]=useState<Team[]>([])
  const [registrations,setRegistrations]=useState<Registration[]>([])
  const [query,setQuery]=useState('')
  const [category,setCategory]=useState('')
  const [payment,setPayment]=useState('')
  const [participation,setParticipation]=useState('')
  const [busy,setBusy]=useState<number|null>(null)
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')

  async function load(){
    setError('')
    try{
      const [er,tr,rr]=await Promise.all([
        fetch(`${API}/api/registration-events`,{headers:{Authorization:`Bearer ${token}`}}),
        fetch(`${API}/api/teams/my`,{headers:{Authorization:`Bearer ${token}`}}),
        fetch(`${API}/api/registrations/my`,{headers:{Authorization:`Bearer ${token}`}}),
      ])
      const [ed,td,rd]=await Promise.all([er.json(),tr.json(),rr.json()])
      if(!er.ok)throw new Error(ed.error||'Could not load events.')
      if(!tr.ok)throw new Error(td.error||'Could not load teams.')
      if(!rr.ok)throw new Error(rd.error||'Could not load registrations.')
      setEvents(ed.rows||[]);setTeams(td.rows||[]);setRegistrations(rd.rows||[])
    }catch(e){setError(e instanceof Error?e.message:'Could not load student events.')}
  }
  useEffect(()=>{load()},[token])

  useEffect(()=>{
    if(selectedEventId)return
    window.scrollTo({top:0,left:0,behavior:'auto'})
  },[selectedEventId])

  useEffect(()=>{
    if(!selectedEventId||events.length===0)return
    const timer=window.setTimeout(()=>{
      const el=document.getElementById(`student-event-${selectedEventId}`)
      if(!el)return
      el.scrollIntoView({behavior:'smooth',block:'center'})
      el.classList.add('event-notification-highlight')
      window.setTimeout(()=>el.classList.remove('event-notification-highlight'),2600)
    },180)
    return()=>window.clearTimeout(timer)
  },[selectedEventId,events.length])

  const activeEventIds=useMemo(()=>new Set(registrations.filter(r=>r.status!=='Cancelled'&&r.status!=='Rejected').map(r=>r.event.id)),[registrations])
  const categories=useMemo(()=>[...new Set(events.map(e=>e.category))].sort(),[events])
  const filtered=useMemo(()=>events.filter(e=>{
    const term=query.trim().toLowerCase()
    if(term&&!`${e.name} ${e.event_code} ${e.category} ${e.organizing_department} ${e.venue}`.toLowerCase().includes(term))return false
    if(category&&e.category!==category)return false
    if(payment&&e.payment_type!==payment)return false
    if(participation&&e.participation_type!==participation&&e.participation_type!=='Both')return false
    return true
  }),[events,query,category,payment,participation])

  async function register(event:EventRow,type:'Individual'|'Team',teamId?:number){
    setBusy(event.id);setError('');setMessage('')
    try{
      const r=await fetch(`${API}/api/registrations`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({event_id:event.id,registration_type:type,team_id:teamId})})
      const d=await r.json();if(!r.ok)throw new Error(d.error||'Registration failed.')
      const status=d.registration?.status
      setMessage(status==='Waiting List'?`You were added to the waiting list at #${d.registration.waiting_position}.`:status==='Payment Pending'?'Registration saved. Complete payment from Payments.':'Registration submitted for coordinator approval.')
      await load()
    }catch(e){setError(e instanceof Error?e.message:'Registration failed.')}finally{setBusy(null)}
  }

  return <section className="portal-content student-explore-page">
    <div className="page-toolbar"><div><span className="eyebrow">Student Explore</span><h2>Discover Events</h2><p>Upcoming and published events matching your department, year and semester are shown here. Registration becomes available only when its window opens.</p></div><Link className="button button-ghost" to="/student/registrations">My Registrations</Link></div>
    {error&&<div className="form-alert error">{error}</div>}{message&&<div className="form-alert success">{message}</div>}
    <div className="student-event-filters"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search event, category, venue..."/><select value={category} onChange={e=>setCategory(e.target.value)}><option value="">All categories</option>{categories.map(x=><option key={x}>{x}</option>)}</select><select value={payment} onChange={e=>setPayment(e.target.value)}><option value="">Free + Paid</option><option>Free</option><option>Paid</option></select><select value={participation} onChange={e=>setParticipation(e.target.value)}><option value="">Individual + Team</option><option>Individual</option><option>Team</option></select></div>
    {filtered.length===0?<div className="empty-state student-empty-action"><div className="empty-icon">EVENT</div><h3>No upcoming events are available right now</h3><p>Approved and published events matching your profile will appear here automatically.</p><Link className="button button-ghost" to="/student/notifications">Check Notifications</Link></div>:<div className="student-event-grid">{filtered.map(event=>{
      const already=activeEventIds.has(event.id)
      const approvedTeams=teams.filter(t=>t.event_id===event.id&&t.status==='Approved')
      return <article id={`student-event-${event.id}`} className={`student-event-card ${selectedEventId===event.id?'event-from-notification':''}`} key={event.id}>
        {event.poster_url && (
          <div className="student-event-poster">
            <img
              src={event.poster_url}
              alt={`${event.name} poster`}
            />
          </div>
        )}
        <div className="student-event-card-head"><div><span className="event-code">{event.event_code}</span><h3>{event.name}</h3><p>{event.category} | {event.organizing_department}</p></div><span className={`status-pill ${event.registration_open_now?'green':'gray'}`}>
  {event.registration_open_now
    ? 'Registration Open'
    : event.status === 'Approved'
      ? 'Coming Soon'
      : 'Registration Closed'}
</span></div><p className="student-event-description">{event.description||'Event details are available from the organizing team.'}</p>
        <details className="student-event-details" open={selectedEventId===event.id}><summary>View full event details</summary><div className="student-event-detail-grid"><section><small>Registration Process</small><b>{event.registration_approval_required?'Coordinator approval required':'Direct registration'}</b><p>{event.registration_approval_required?'After you register, a coordinator will review your eligibility. For paid events, payment becomes available after approval.':'If you are eligible, registration is accepted directly. For paid events, payment becomes available immediately.'}</p></section><section><small>Rules & Regulations</small><p>{event.rules||'No additional rules have been added.'}</p></section><section><small>Requirements / What to Bring</small><p>{event.requirements||'No special requirements have been added.'}</p></section><section><small>Prizes / Benefits</small><p>{event.prizes||'No prize information has been added.'}</p></section><section><small>Payment Methods</small><p>{event.payment_type==='Paid'?[event.online_payment?'Online payment':'',event.offline_payment?'Offline payment to coordinator':''].filter(Boolean).join(' + ')||'Payment method will be announced': 'No payment required - this is a free event.'}</p></section><section><small>Contact / Help</small><p>{event.contact_info||'Contact the organizing department for assistance.'}</p></section></div></details>
        <div className="student-event-meta"><div><small>Date</small><b>{event.event_date}</b></div><div><small>Time</small><b>{event.start_time}{event.end_time?(" - "+event.end_time):""}</b></div><div><small>Venue</small><b>{event.venue}</b></div><div><small>Fee</small><b>{event.payment_type==="Paid"?("Rs. "+event.fee):"Free"}</b></div><div><small>Seats</small><b>{event.seats_remaining==null?'No limit':`${event.seats_remaining} left`}</b></div><div><small>Participation</small><b>{event.participation_type}</b></div></div>
        {!event.registration_open_now&&<div className="registered-banner">INFO: Event details are available now. Registration will become available when the event registration window opens.</div>}
        {already?<div className="registered-banner">REGISTERED: You already have an active registration for this event. <Link to="/student/registrations">View status</Link></div>:<div className="student-event-actions">{(event.participation_type==='Individual'||event.participation_type==='Both')&&<button className="button button-primary" disabled={busy===event.id||!event.registration_open_now} onClick={()=>register(event,'Individual')}>{busy===event.id?'Registering...':'Register Individually'}</button>}{(event.participation_type==='Team'||event.participation_type==='Both')&&(approvedTeams.length?<select defaultValue="" disabled={busy===event.id||!event.registration_open_now} onChange={e=>{const id=Number(e.target.value);if(id)register(event,'Team',id)}}><option value="">Register an approved team...</option>{approvedTeams.map(t=><option key={t.id} value={t.id}>{t.team_name} | {t.team_code}</option>)}</select>:event.registration_open_now
  ? <Link className="button button-ghost" to="/student/teams">Create / Approve Team</Link>
  : <span className="registration-unavailable">Registration is not open yet.</span>)}</div>}
      </article>
    })}</div>}
  </section>
}



