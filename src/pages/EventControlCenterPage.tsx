import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { API, useAuth } from '../auth/AuthContext'
import ParticipantsPanel from '../components/ParticipantsPanel'
import CertificatesPanel from '../components/CertificatesPanel'
import TeamManagementPage from './TeamManagementPage'
import ScannerPage from './ScannerPage'
import CoordinatorPaymentReconciliationPage from './CoordinatorPaymentReconciliationPage'
import CoordinatorAttendanceReportPage from './CoordinatorAttendanceReportPage'
import CoordinatorFinalEventReportPage from './CoordinatorFinalEventReportPage'
import ResultsPanel from '../components/ResultsPanel'

type EventData={
  id:number;event_code:string;name:string;description?:string;category:string;organizing_department:string;
  event_date:string;start_time:string;end_time?:string|null;venue:string;capacity?:number|null;status:string;
  payment_type:string;fee:number;participation_type?:string;team_min?:number|null;team_max?:number|null;
  registration_open?:string|null;registration_deadline?:string|null;main_coordinator_name?:string|null;
}

type Team={id:number;team_name:string;team_code:string;status:string;members?:unknown[]}

type SectionKey='overview'|'participants'|'teams'|'payments'|'communication'|'scanner'|'attendance'|'results'|'certificates'|'gallery'|'reports'

const sections:{key:SectionKey;label:string;icon:string}[]=[
  {key:'overview',label:'Overview',icon:'OV'},
  {key:'participants',label:'Participants',icon:'P'},
  {key:'teams',label:'Teams',icon:'T'},
  {key:'payments',label:'Payments',icon:'PAY'},
  {key:'communication',label:'Communication',icon:'MSG'},
  {key:'scanner',label:'ID Scanner',icon:'ID'},
  {key:'attendance',label:'Attendance',icon:'AT'},
  {key:'results',label:'Results',icon:'R'},
  {key:'certificates',label:'Certificates',icon:'C'},
  {key:'gallery',label:'Gallery',icon:'G'},
  {key:'reports',label:'Reports',icon:'REP'},
]

function fmtDate(value?:string){
  if(!value)return 'Not set'
  const date=new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime())?value:date.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})
}

export default function EventControlCenterPage(){
  const {eventId}=useParams();const {token,user}=useAuth();const base=user?.role==='Super Admin'?'/admin':'/coordinator';
  const [event,setEvent]=useState<EventData|null>(null);const [teams,setTeams]=useState<Team[]>([])
  const [section,setSection]=useState<SectionKey>('overview');const [loading,setLoading]=useState(true);const [error,setError]=useState('')

  useEffect(()=>{(async()=>{setLoading(true);setError('');try{
    const r=await fetch(`${API}/api/events/${eventId}`,{headers:{Authorization:`Bearer ${token}`}});const d=await r.json();if(!r.ok)throw new Error(d.error);setEvent(d.event)
    const tr=await fetch(`${API}/api/teams/manage?event_id=${eventId}`,{headers:{Authorization:`Bearer ${token}`}});const td=await tr.json();if(tr.ok)setTeams(td.rows||[])
  }catch(e){setError(e instanceof Error?e.message:'Could not load the event control center.')}finally{setLoading(false)}})()},[eventId,token])

  const teamStats=useMemo(()=>({total:teams.length,approved:teams.filter(t=>t.status==='Approved').length,pending:teams.filter(t=>t.status==='Pending').length}),[teams])
  if(loading)return <section className="portal-content"><div className="control-loading"><div className="spinner"/><h3>Opening Event Control Center...</h3></div></section>
  if(error||!event)return <section className="portal-content"><div className="form-alert error">{error||'Event not found.'}</div><Link className="button button-ghost" to={`${base}/events`}>Back to Events</Link></section>

  return <section className="portal-content control-center-page">
    <div className="control-hero">
      <div className="control-hero-main">
        <div className="control-breadcrumb"><Link to={`${base}/events`}>My Events</Link><span>&gt;</span><span>{event.event_code}</span></div>
        <div className="control-title-row"><div><div className="control-tags"><span className={`event-status status-${event.status.toLowerCase().replaceAll(' ','-')}`}>{event.status}</span><span className="soft-chip">{event.category}</span><span className="soft-chip">{event.organizing_department}</span></div><h2>{event.name}</h2><p>{event.description||'Manage this event from one workspace.'}</p></div><div className="control-primary-actions"><button className="button button-light" onClick={()=>setSection('scanner')}>Scan College ID</button><button className="button button-outline-light" onClick={()=>setSection('teams')}>Manage Teams</button></div></div>
      <div className="control-meta-strip"><div><small>Date</small><b>{fmtDate(event.event_date)}</b></div><div><small>Time</small><b>{event.start_time}{event.end_time ? ` - ${event.end_time}` : ''}</b></div><div><small>Venue</small><b>{event.venue}</b></div><div><small>Participation</small><b>{event.participation_type || 'Individual'}</b></div><div><small>Fee</small><b>{event.payment_type === 'Paid' ? `Rs. ${event.fee}` : 'Free'}</b></div></div>
      </div>
    </div>

    <div className="control-layout">
      <aside className="control-nav"><div className="control-nav-label">EVENT WORKSPACE</div>{sections.map(s=><button key={s.key} className={section===s.key?'active':''} onClick={()=>setSection(s.key)}><span>{s.icon}</span>{s.label}{s.key==='teams'&&teamStats.pending>0?<em>{teamStats.pending}</em>:null}</button>)}</aside>

      <div className="control-workspace">
        {section==='overview'&&<>
          <div className="control-section-head"><div><span className="eyebrow">Live workspace</span><h3>Event Overview</h3><p>Everything important about this event, without jumping between unrelated modules.</p></div></div>
          <div className="metric-grid control-metrics">
          <article><span className="metric-icon">P</span><div><small>Participants</small><strong><button className="text-link" onClick={()=>setSection('participants')}>View</button></strong><p>Registrations and eligibility</p></div></article>
          <article><span className="metric-icon">T</span><div><small>Teams</small><strong>{teamStats.total}</strong><p>{teamStats.approved} approved | {teamStats.pending} pending</p></div></article>
          <article><span className="metric-icon">PAY</span><div><small>Payments</small><strong>-</strong><p>{event.payment_type === 'Paid' ? 'View payment reconciliation' : 'Free event'}</p></div></article>
          <article><span className="metric-icon">IN</span><div><small>Checked In</small><strong>-</strong><p>View attendance report</p></div></article>
          </div>

          <div className="control-two-col">
            <article className="control-panel"><div className="panel-head"><div><span className="eyebrow">Event journey</span><h4>Lifecycle</h4></div><span className="event-status status-published">{event.status}</span></div><div className="lifecycle-track">{['Draft','Submitted','Approved','Published','Registration','Event Day','Results','Certificates'].map((x,i)=>{const stageIndex=event.status==='Draft'?0:event.status==='Submitted'?1:event.status==='Approved'?2:['Published','Registration Open','Registration Closed'].includes(event.status)?3:['Ongoing','Completed'].includes(event.status)?5:event.status==='Results Published'?6:event.status==='Certificates Issued'?7:3;return <div key={x} className={i<=stageIndex?'done':''}><span>{i<stageIndex?'Done':i+1}</span><small>{x}</small></div>})}</div></article>
            <article className="control-panel"><div className="panel-head"><div><span className="eyebrow">Quick actions</span><h4>Run this event</h4></div></div><div className="action-tile-grid"><button onClick={()=>setSection('participants')}><b>P</b><span>Participants<small>Registrations & eligibility</small></span></button><button onClick={()=>setSection('teams')}><b>T</b><span>Teams<small>Review competition teams</small></span></button><button onClick={()=>setSection('scanner')}><b>ID</b><span>Scan ID<small>Event-day verification</small></span></button><button onClick={()=>setSection('results')}><b>R</b><span>Results<small>Judging & rankings</small></span></button></div></article>
          </div>

          <div className="control-two-col">
            <article className="control-panel"><div className="panel-head"><div><span className="eyebrow">Competition</span><h4>Participation Rules</h4></div></div><div className="detail-list"><div><span>Participation type</span><b>{event.participation_type||'Individual'}</b></div><div><span>Team size</span><b>{event.participation_type==='Individual'?'Not applicable':`${event.team_min||2} - ${event.team_max||'Not set'} students`}</b></div><div><span>Capacity</span><b>{event.capacity||'Unlimited / not set'}</b></div><div><span>Registration deadline</span><b>{fmtDate(event.registration_deadline||undefined)}</b></div></div></article>
            <article className="control-panel team-snapshot"><div className="panel-head"><div><span className="eyebrow">Team activity</span><h4>Competition Teams</h4></div><button className="text-link" onClick={()=>setSection('teams')}>Open Teams</button></div>{teams.length===0?<div className="mini-empty"><span>   </span><b>No teams yet</b><p>Teams created by students or coordinators will appear here.</p></div>:<div className="team-mini-list">{teams.slice(0,4).map(t=><div key={t.id}><span className="team-avatar">{t.team_name.slice(0,1).toUpperCase()}</span><div><b>{t.team_name}</b><small>{t.team_code}</small></div><span className={`status-pill ${t.status==='Approved'?'green':t.status==='Pending'?'blue':'gray'}`}>{t.status}</span></div>)}</div>}</article>
          </div>
        </>}

        {section==='participants'&&<ParticipantsPanel event={event}/>}
        {section==='results'&&<ResultsPanel event={event}/>}

        {section==='teams'&&<TeamManagementPage initialEventId={String(event.id)}/>}
        {section==='scanner'&&<ScannerPage initialEventId={String(event.id)}/>}
        {section==='payments'&&<CoordinatorPaymentReconciliationPage initialEventId={String(event.id)}/>}
        {section==='attendance'&&<CoordinatorAttendanceReportPage initialEventId={String(event.id)}/>}
        {section==='reports'&&<CoordinatorFinalEventReportPage initialEventId={String(event.id)}/>}
        {section==='certificates'&&<CertificatesPanel eventId={event.id}/>}
        {section==='communication'&&<div className="feature-stage"><h3>Event communication</h3><p>Choose the participant group and event when composing a notification.</p><Link className="button button-primary" to={`${base}/notifications`}>Open communication center</Link></div>}
        {section==='gallery'&&<div className="feature-stage"><h3>Event gallery</h3><p>{user?.role==='Super Admin'?'Manage approved event photographs and highlights.':'Gallery uploads are managed by your administrator.'}</p><Link className="button button-primary" to={user?.role==='Super Admin'?'/admin/gallery':'/gallery'}>{user?.role==='Super Admin'?'Manage gallery':'View gallery'}</Link></div>}
      </div>
    </div>
  </section>
}
