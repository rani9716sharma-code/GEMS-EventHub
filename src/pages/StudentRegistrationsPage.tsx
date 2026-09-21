import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { API, useAuth } from '../auth/AuthContext'

type EventRow={id:number;event_code:string;name:string;category:string;organizing_department:string;event_date:string;start_time:string;venue:string;capacity?:number|null;seats_used:number;seats_remaining?:number|null;registration_open_now:boolean;participation_type:string;payment_type:string;fee:number;team_min?:number|null;team_max?:number|null}
type Team={id:number;event_id:number;team_name:string;team_code:string;status:string}
type Registration={id:number;registration_type:'Individual'|'Team';status:string;waiting_position?:number|null;event:EventRow;subject:any}

export default function StudentRegistrationsPage(){
  const {token}=useAuth();const [events,setEvents]=useState<EventRow[]>([]);const [teams,setTeams]=useState<Team[]>([]);const [registrations,setRegistrations]=useState<Registration[]>([]);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [message,setMessage]=useState('')
  async function load(){setError('');try{const [er,tr,rr]=await Promise.all([
    fetch(`${API}/api/registration-events`,{headers:{Authorization:`Bearer ${token}`}}),
    fetch(`${API}/api/teams/my`,{headers:{Authorization:`Bearer ${token}`}}),
    fetch(`${API}/api/registrations/my`,{headers:{Authorization:`Bearer ${token}`}}),
  ]);const [ed,td,rd]=await Promise.all([er.json(),tr.json(),rr.json()]);if(!er.ok)throw new Error(ed.error);if(!tr.ok)throw new Error(td.error);if(!rr.ok)throw new Error(rd.error);setEvents(ed.rows||[]);setTeams(td.rows||[]);setRegistrations(rd.rows||[])}catch(e){setError(e instanceof Error?e.message:'Could not load registrations.')}}
  useEffect(()=>{load()},[token])
  const registeredEventIds=useMemo(()=>new Set(registrations.filter(r=>r.status!=='Cancelled').map(r=>r.event.id)),[registrations])
  async function register(event:EventRow,type:'Individual'|'Team',teamId?:number){setBusy(true);setError('');setMessage('');try{const r=await fetch(`${API}/api/registrations`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({event_id:event.id,registration_type:type,team_id:teamId})});const d=await r.json();if(!r.ok)throw new Error(d.error);setMessage(
  d.registration.status==='Waiting List'
    ? `Registration added to waiting list at position #${d.registration.waiting_position}.`
    : d.registration.status==='Payment Pending'
      ? 'Registration saved. Payment is pending.'
      : d.registration.status==='Waiting for Approval'
        ? 'Registration submitted. Waiting for coordinator approval.'
        : 'Registration confirmed.'
);await load()}catch(e){setError(e instanceof Error?e.message:'Could not register.')}finally{setBusy(false)}}
  async function cancel(id:number){if(!window.confirm('Cancel this registration?'))return;setBusy(true);setError('');try{const r=await fetch(`${API}/api/registrations/${id}/cancel`,{method:'POST',headers:{Authorization:`Bearer ${token}`}});const d=await r.json();if(!r.ok)throw new Error(d.error);setMessage('Registration cancelled.');await load()}catch(e){setError(e instanceof Error?e.message:'Could not cancel registration.')}finally{setBusy(false)}}
  return <section className="portal-content registration-page">
    <div className="page-toolbar"><div><span className="eyebrow">Student registration</span><h2>My Registrations</h2><p>Register for individual events or use one of your approved teams.</p></div></div>
    {error&&<div className="form-alert error">{error}</div>}{message&&<div className="form-alert success">{message}</div>}
    <div className="student-reg-grid">
      <div className="student-reg-main"><div className="section-mini-head"><div><span className="eyebrow">Open now</span><h3>Events You Can Join</h3></div><span className="count-badge">{events.length}</span></div>
        {events.length===0?<div className="empty-state compact"><div className="empty-icon">◎</div><h3>No registrations open</h3><p>Eligible published events will appear here automatically.</p></div>:<div className="registration-event-stack">{events.map(event=>{
          const eventTeams=teams.filter(t=>t.event_id===event.id&&t.status==='Approved');const already=registeredEventIds.has(event.id)
          return <article className="registration-event-card" key={event.id}><div className="reg-event-top"><div><span>{event.event_code} • {event.category}</span><h3>{event.name}</h3><p>{event.organizing_department} • {event.event_date} • {event.start_time} • {event.venue}</p></div><span className={`status-pill ${event.registration_open_now?'green':'gray'}`}>{event.registration_open_now?'Open':'Closed'}</span></div>
            <div className="reg-event-stats"><div><small>Participation</small><b>{event.participation_type}</b></div><div><small>Fee</small><b>{event.payment_type==='Paid'?`₹${event.fee}`:'Free'}</b></div><div><small>Seats</small><b>{event.seats_remaining===null||event.seats_remaining===undefined?'No limit':`${event.seats_remaining} left`}</b></div></div>
            {already?<div className="registered-banner">✓ You already have an active registration for this event.</div>:<div className="reg-actions">
              {(event.participation_type==='Individual'||event.participation_type==='Both')&&<button disabled={busy||!event.registration_open_now} className="button button-primary" onClick={()=>register(event,'Individual')}>Register Individually</button>}
              {(event.participation_type==='Team'||event.participation_type==='Both')&&(eventTeams.length?<select defaultValue="" disabled={busy||!event.registration_open_now} onChange={e=>{const id=Number(e.target.value);if(id)register(event,'Team',id)}}><option value="">Register Approved Team…</option>{eventTeams.map(t=><option key={t.id} value={t.id}>{t.team_name} • {t.team_code}</option>)}</select>:<span className="helper-text">Create a team and get coordinator approval before team registration.</span>)}
            </div>}
          </article>})}</div>}
      </div>
      <aside className="student-reg-side"><div className="section-mini-head"><div><span className="eyebrow">Your activity</span><h3>Registration History</h3></div></div>{registrations.length===0?<div className="mini-empty"><span>◇</span><b>No registrations yet</b><p>Your real registrations will be saved here.</p></div>:<div className="my-registration-list">{registrations.map(r=><article key={r.id}><div><span>{r.event.event_code}</span><h4>{r.event.name}</h4><small>{r.registration_type}{r.registration_type==='Team'&&r.subject?.team_name?` • ${r.subject.team_name}`:''}</small></div><span className={`event-status status-${r.status.toLowerCase().replaceAll(' ','-')}`}>{r.status}{r.waiting_position?` #${r.waiting_position}`:''}</span>{r.status==='Payment Pending'&&<Link className="button button-primary button-small" to="/student/payments">Pay Now</Link>}{r.status!=='Cancelled'&&<button className="text-danger" disabled={busy} onClick={()=>cancel(r.id)}>Cancel</button>}</article>)}</div>}</aside>
    </div>
  </section>
}
