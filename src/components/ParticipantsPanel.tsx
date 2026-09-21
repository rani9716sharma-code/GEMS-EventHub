import { FormEvent, useEffect, useMemo, useState } from 'react'
import { API, useAuth } from '../auth/AuthContext'

type EventData={id:number;name:string;participation_type?:string;capacity?:number|null;payment_type:string;offline_payment?:boolean;registration_approval_required?:boolean}
type Row={id:number;registration_type:'Individual'|'Team';status:string;waiting_position?:number|null;source:string;created_at:string;subject:any;payment?:{id:number;amount:number;status:string;method:string}|null}

export default function ParticipantsPanel({event}:{event:EventData}){
  const {token}=useAuth();const [rows,setRows]=useState<Row[]>([]);const [summary,setSummary]=useState<{status:string;count:number}[]>([]);const [seats,setSeats]=useState(0);const [q,setQ]=useState('');const [status,setStatus]=useState('');const [studentId,setStudentId]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [message,setMessage]=useState('')
  async function load(){setError('');try{const p=new URLSearchParams({event_id:String(event.id)});if(q)p.set('q',q);if(status)p.set('status',status);const r=await fetch(`${API}/api/registrations/manage?${p}`,{headers:{Authorization:`Bearer ${token}`}});const d=await r.json();if(!r.ok)throw new Error(d.error);setRows(d.rows||[]);setSummary(d.summary||[]);setSeats(d.seats_used||0)}catch(e){setError(e instanceof Error?e.message:'Could not load participants.')}}
  useEffect(()=>{load()},[event.id,token,status])
  const counts=useMemo(()=>Object.fromEntries(summary.map(x=>[x.status,x.count])),[summary])
  async function assist(e:FormEvent){e.preventDefault();if(!studentId.trim())return;setBusy(true);setError('');setMessage('');try{const r=await fetch(`${API}/api/registrations`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({event_id:event.id,registration_type:'Individual',student_id:studentId.trim()})});const d=await r.json();if(!r.ok)throw new Error(d.error);setStudentId('');setMessage(d.registration.status==='Waiting List'?`Student added to waiting list #${d.registration.waiting_position}.`:'Student registration created.');await load()}catch(e){setError(e instanceof Error?e.message:'Could not register student.')}finally{setBusy(false)}}
  async function reviewRegistration(id:number,action:'approve'|'reject'){
    if(action==='reject'&&!window.confirm('Reject this registration?'))return
    setBusy(true);setError('');setMessage('')
    try{
      const r=await fetch(`${API}/api/registrations/${id}/approval`,{
        method:'POST',
        headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
        body:JSON.stringify({action})
      })
      const d=await r.json()
      if(!r.ok)throw new Error(d.error)
      setMessage(action==='approve'?'Registration approved.':'Registration rejected.')
      await load()
    }catch(e){
      setError(e instanceof Error?e.message:'Could not review registration.')
    }finally{
      setBusy(false)
    }
  }

  async function verifyOfflinePayment(row:Row){
    if(!window.confirm(`Confirm that offline payment of ₹${Number(row.payment?.amount||0).toFixed(2)} has been received?`))return
    setBusy(true);setError('');setMessage('')
    try{
      const r=await fetch(`${API}/api/payments/registration/${row.id}/offline-verify`,{method:'POST',headers:{Authorization:`Bearer ${token}`}})
      const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not verify offline payment.')
      setMessage('Offline payment verified. Registration confirmed.');await load()
    }catch(e){setError(e instanceof Error?e.message:'Could not verify offline payment.')}finally{setBusy(false)}
  }

  async function cancel(id:number){if(!window.confirm('Cancel this registration?'))return;setBusy(true);try{const r=await fetch(`${API}/api/registrations/${id}/cancel`,{method:'POST',headers:{Authorization:`Bearer ${token}`}});const d=await r.json();if(!r.ok)throw new Error(d.error);setMessage('Registration cancelled.');await load()}catch(e){setError(e instanceof Error?e.message:'Could not cancel.')}finally{setBusy(false)}}
  return <div className="participants-panel"><div className="control-section-head"><div><span className="eyebrow">Registration operations</span><h3>Participants</h3><p>Individual and team registrations, capacity and waiting list for this event.</p></div></div>{error&&<div className="form-alert error">{error}</div>}{message&&<div className="form-alert success">{message}</div>}
    <div className="metric-grid compact-metrics"><article><span className="metric-icon">◎</span><div><small>Active seats</small><strong>{seats}</strong><p>{event.capacity?`${Math.max(0,event.capacity-seats)} remaining of ${event.capacity}`:'No capacity limit'}</p></div></article><article><span className="metric-icon">✓</span><div><small>Confirmed</small><strong>{counts['Confirmed']||0}</strong><p>Approved registrations</p></div></article><article><span className="metric-icon">◷</span><div><small>Waiting Approval</small><strong>{counts['Waiting for Approval']||0}</strong><p>Coordinator review required</p></div></article><article><span className="metric-icon">₹</span><div><small>Payment Pending</small><strong>{counts['Payment Pending']||0}</strong><p>Paid registrations</p></div></article><article><span className="metric-icon">⌛</span><div><small>Waiting List</small><strong>{counts['Waiting List']||0}</strong><p>Capacity reached</p></div></article></div>
    <div className="participant-tools"><form onSubmit={assist} className="assist-registration"><div><span className="eyebrow">Coordinator assistance</span><h4>Register Student</h4><p>Use Student ID when a student needs assistance or has no smartphone.</p></div><div className="assist-row"><input value={studentId} onChange={e=>setStudentId(e.target.value)} placeholder="Student ID" disabled={event.participation_type==='Team'}/><button className="button button-primary" disabled={busy||event.participation_type==='Team'}>Register</button></div>{event.participation_type==='Team'&&<small>Team-only event: create/approve the team first, then register it from Team Management.</small>}</form></div>
    <div className="participant-list-panel"><div className="participant-filter-bar"><input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')load()}} placeholder="Search student, Student ID, team or team code…"/><select value={status} onChange={e=>setStatus(e.target.value)}><option value="">All statuses</option>{['Waiting for Approval','Confirmed','Payment Pending','Waiting List','Rejected','Cancelled'].map(x=><option key={x}>{x}</option>)}</select><button className="button button-ghost button-small" onClick={load}>Search</button></div>
      {rows.length===0?<div className="empty-state compact"><div className="empty-icon">◎</div><h3>No participants yet</h3><p>Registrations will appear here as students or teams join.</p></div>:<div className="participant-stack">{rows.map(r=><article key={r.id}><div className="participant-avatar">{r.registration_type==='Team'?'T':(r.subject?.name||'?').slice(0,1)}</div><div className="participant-main"><span>{r.registration_type} • {r.source}</span><h4>{r.registration_type==='Team'?r.subject?.team_name:r.subject?.name}</h4><p>{r.registration_type==='Team'?`${r.subject?.team_code} • ${r.subject?.members?.length||0} members`:`${r.subject?.student_id} • ${r.subject?.department} • Year ${r.subject?.year}`}</p></div><div className="participant-status-stack"><span className={`event-status status-${r.status.toLowerCase().replaceAll(' ','-')}`}>{r.status}{r.waiting_position?` #${r.waiting_position}`:''}</span>{r.payment&&<small>Payment: {r.payment.status} • ₹{Number(r.payment.amount).toFixed(2)}</small>}</div>{r.status==='Waiting for Approval'&&<><button className="button success-button button-small" disabled={busy} onClick={()=>reviewRegistration(r.id,'approve')}>Approve</button><button className="button danger-button button-small" disabled={busy} onClick={()=>reviewRegistration(r.id,'reject')}>Reject</button></>}{r.status==='Payment Pending'&&event.offline_payment&&<button className="button button-primary button-small" disabled={busy} onClick={()=>verifyOfflinePayment(r)}>Verify Offline Payment</button>}{r.status!=='Cancelled'&&r.status!=='Rejected'&&<button className="button button-ghost button-small" disabled={busy} onClick={()=>cancel(r.id)}>Cancel</button>}</article>)}</div>}
    </div>
  </div>
}
