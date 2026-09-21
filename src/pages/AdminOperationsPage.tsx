import {FormEvent,useEffect,useState} from 'react'
import {useLocation} from 'react-router-dom'
import {API,useAuth} from '../auth/AuthContext'
import { appPath } from '../lib/paths'

type Data={events:any[];students:any[];users:any[];venues:any[];payments:any[];attendance:any[];results:any[];rules:any[];audit:any[];settings:any[];notifications:any[]}
const labels:Record<string,[string,string]>= {
 departments:['Department Management','Live department participation, coordinators, students and events.'],library:['Library Management','Manage real library-led events and participation.'],venues:['Venue Management','Maintain venues and see actual event usage.'],calendar:['Schedule & Calendar','Real EventHub schedule with venue/date conflict visibility.'],reports:['Reports & Analytics','Live operational totals calculated from EventHub records.'],rankings:['Achievement & Ranking Settings','Configure point rules and review published achievements.'],audit:['Audit & Security','Review recorded administrative and payment activity.'],notifications:['Notification Center','Review in-app delivery and send announcements to students.'],settings:['Settings','Edit EventHub operational settings.']}
function fmt(n:any){return Number(n||0).toLocaleString('en-IN')}

function downloadCsv(rows:any[]){
 const escape=(value:any)=>`"${String(value??'').replace(/"/g,'""')}"`
 const headers=['Event','Code','Category','Date','Venue','Department','Status','Registrations']
 const body=rows.map(e=>[
   e.name,
   e.event_code,
   e.category,
   e.event_date,
   e.venue,
   e.organizing_department,
   e.status,
   e.registration_count||0
 ].map(escape).join(','))

 const csv=[headers.join(','),...body].join('\r\n')
 const blob=new Blob([csv],{type:'text/csv;charset=utf-8'})
 const url=URL.createObjectURL(blob)
 const a=document.createElement('a')
 a.href=url
 a.download='eventhub-events-report.csv'
 document.body.appendChild(a)
 a.click()
 a.remove()
 URL.revokeObjectURL(url)
}
export default function AdminOperationsPage(){
 const {pathname}=useLocation();const key=pathname.split('/').pop()||'reports';const {token}=useAuth();
 const [data,setData]=useState<Data|null>(null);const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [refreshing,setRefreshing]=useState(false)
 const auth={Authorization:`Bearer ${token}`,'Content-Type':'application/json'}
 async function load(showRefresh=false){
  if(showRefresh)setRefreshing(true)
  try{
   setError('')
   const r=await fetch(`${API}/api/admin/operations`,{
    headers:{Authorization:`Bearer ${token}`},
    cache:'no-store'
   })
   const d=await r.json()
   if(!r.ok)throw new Error(d.error||'Unable to load module.')
   setData(d)
  }catch(e:any){
   setError(e.message)
  }finally{
   if(showRefresh)setRefreshing(false)
  }
 }
 useEffect(()=>{load()},[token])
 async function post(url:string,body:any,method='POST'){setBusy(true);try{const r=await fetch(`${API}${url}`,{method,headers:auth,body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw new Error(d.error||'Request failed');await load();return d}catch(e:any){alert(e.message)}finally{setBusy(false)}}
 const title=labels[key]||['Administration','Operational workspace'];if(!data)return <div className="page-stack"><section className="page-hero compact"><h2>{title[0]}</h2><p>{error||'Loading live EventHub data...'}</p></section></div>
 const activeEvents=data.events.filter(e=>!['Completed','Archived'].includes(e.status));const paid=data.payments.filter(p=>p.status==='Paid');const revenue=paid.reduce((a,p)=>a+Number(p.amount||0),0)
 const departments=[
  {
    dbName:'CSE',
    code:'CSE',
    fullName:'Computer Science',
    theme:'department-cse'
  },
  {
    dbName:'Civil',
    code:'CE',
    fullName:'Civil Engineering',
    theme:'department-ce'
  },
  {
    dbName:'Mechanical',
    code:'ME',
    fullName:'Mechanical Engineering',
    theme:'department-me'
  },
  {
    dbName:'Electrical',
    code:'EE',
    fullName:'Electrical Engineering',
    theme:'department-ee'
  },
  {
    dbName:'EEE',
    code:'EEE',
    fullName:'Electrical & Electronics Engineering',
    theme:'department-eee'
  }
].map(dept=>({
  ...dept,

  students:data.students.filter(
    s=>s.department===dept.dbName
  ).length,

  events:data.events.filter(
    e=>e.organizing_department===dept.dbName
  ).length,

  coordinators:data.users.filter(
    u=>
      u.role==='Department Coordinator' &&
      u.department===dept.dbName
  ).length,

  registrations:data.events
    .filter(
      e=>e.organizing_department===dept.dbName
    )
    .reduce(
      (total,event)=>
        total+Number(event.registration_count||0),
      0
    )
}))
 return <div className="page-stack admin-ops"><section className="page-hero compact"><div><span className="eyebrow">Super Admin - Live module</span><h2>{title[0]}</h2><p>{title[1]}</p></div><button
 type="button"
 className="secondary-button"
 onClick={()=>window.location.reload()}
 disabled={refreshing}
>
 <span aria-hidden="true">&#8635;</span>
 {refreshing?' Refreshing...':' Refresh'}
</button></section>{error&&<div className="error-banner">{error}</div>}
 {key==='departments'&&<><div className="ops-kpis"><K label="Departments" value="5"/><K label="Students" value={fmt(data.students.length)}/><K label="Department coordinators" value={fmt(data.users.filter(u=>u.role==='Department Coordinator').length)}/><K label="Department events" value={fmt(data.events.filter(e=>e.event_scope==='Department').length)}/></div><section className="ops-grid">{departments.map(d=>
  <article
    className={`ops-card department-card ${d.theme}`}
    key={d.code}
    tabIndex={0}
  >
    <div className="ops-card-head">

      <span className="ops-icon department-icon">
        {d.code}
      </span>

      <div className="department-copy">
        <h3>{d.code}</h3>

        <strong className="department-full-name">
          {d.fullName}
        </strong>

        <p>
          {d.coordinators} coordinator
          {d.coordinators===1?'':'s'}
        </p>
      </div>

      <span className="department-chevron">
        &gt;
      </span>

    </div>

    <div className="mini-stats">

      <b>
        {d.students}
        <small>Students</small>
      </b>

      <b>
        {d.events}
        <small>Events</small>
      </b>

      <b>
        {d.registrations}
        <small>Registrations</small>
      </b>

    </div>
  </article>
)}</section></>}
 {key==='library'&&<><div className="ops-kpis"><K label="Library events" value={fmt(data.events.filter(e=>e.event_scope==='Library'||e.category==='Library').length)}/><K label="Published / Open" value={fmt(data.events.filter(e=>(e.event_scope==='Library'||e.category==='Library')&&['Published','Registration Open'].includes(e.status)).length)}/><K label="Registrations" value={fmt(data.events.filter(e=>e.event_scope==='Library'||e.category==='Library').reduce((a,e)=>a+Number(e.registration_count||0),0))}/><K label="Librarians" value={fmt(data.users.filter(u=>u.role==='Librarian').length)}/></div><EventTable rows={data.events.filter(e=>e.event_scope==='Library'||e.category==='Library')} empty="No library event has been created yet. Create an event and choose Library scope/category."/></>}
 {key==='venues'&&<><VenueForm disabled={busy} onAdd={(x:any)=>post('/api/admin/venues',x)}/><section className="ops-grid">{data.venues.map(v=>{const uses=data.events.filter(e=>e.venue===v.name);return <article className="ops-card" key={v.id}><div className="ops-card-head"><span className="ops-icon">V</span><div><h3>{v.name}</h3><p>{v.type} - {v.active?'Active':'Inactive'}</p></div></div><div className="mini-stats"><b>{uses.length}<small>Total events</small></b><b>{uses.filter(e=>new Date(e.event_date)>=new Date()).length}<small>Upcoming</small></b></div><button className="danger-lite" disabled={busy||uses.length>0} onClick={()=>post(`/api/admin/venues/${v.id}`,{},'DELETE')}>Delete</button></article>})}</section></>}
 {key==='calendar'&&<><div className="ops-kpis"><K label="Upcoming" value={fmt(activeEvents.length)}/><K label="Today" value={fmt(data.events.filter(e=>e.event_date===new Date().toISOString().slice(0,10)).length)}/><K label="Venues" value={fmt(data.venues.length)}/><K label="Published/Open" value={fmt(data.events.filter(e=>['Published','Registration Open'].includes(e.status)).length)}/></div><EventTable rows={[...data.events].sort((a,b)=>String(a.event_date).localeCompare(String(b.event_date)))} empty="No events scheduled." calendar/></>}
 {key==='reports'&&<><div className="ops-kpis"><K label="Events" value={fmt(data.events.length)}/><K label="Students" value={fmt(data.students.length)}/><K label="Registrations" value={fmt(data.events.reduce((a,e)=>a+Number(e.registration_count||0),0))}/><K label="Revenue collected" value={`Rs. ${fmt(revenue)}`}/><K label="Paid payments" value={fmt(paid.length)}/><K label="Pending payments" value={fmt(data.payments.filter(p=>p.status==='Pending').length)}/><K label="Attendance records" value={fmt(data.attendance.length)}/><K label="Published results" value={fmt(data.results.filter(r=>r.published).length)}/></div><section className="ops-panel"><div className="panel-title"><div><h3>Event performance</h3><p>Registration totals and current lifecycle status.</p></div><button className="secondary-button" onClick={()=>downloadCsv(data.events)}>Export CSV</button></div><EventTable rows={data.events} empty="No report data yet."/></section></>}
 {key==='rankings'&&<><section className="ops-panel"><div className="panel-title"><div><div className="ranking-section-heading">
  <span className="ranking-heading-icon" aria-hidden="true">
    <span></span>
    <span></span>
    <span></span>
  </span>

  <div>
    <h3>Achievement point rules</h3>
  </div>
</div><p>These points feed the student leaderboard after official results are published.</p></div></div><div className="rule-grid">{data.rules.map(r=><Rule key={r.id} row={r} disabled={busy} save={(points:number)=>post('/api/achievement-rules',{code:r.code,points},'PATCH')}/>)}</div></section><section className="ops-panel"><h3>Published achievements</h3><SimpleTable headers={['Student','Award','Position','Points']} rows={data.results.filter(r=>r.published).map(r=>[r.student_name||r.student_id||'Team',r.award,r.position||'-',r.points_awarded])} empty="No published results yet."/></section></>}
 {key==='audit'&&<section className="ops-panel"><div className="panel-title"><div><h3>System activity</h3><p>Latest attributable administrative records.</p></div></div><SimpleTable headers={['When','User','Action','Entity','Details']} rows={data.audit.map(a=>[a.created_at,a.user_name||'System',a.action,`${a.entity_type||'-'} ${a.entity_id||''}`,a.details||'-'])} empty="No system audit records yet."/></section>}
 {key==='notifications'&&<><NotificationForm disabled={busy} onSend={(x:any)=>post('/api/admin/notifications/broadcast',x)}/><section className="ops-panel"><h3>Recent notifications</h3><SimpleTable headers={['When','Recipient','Title','Message','Read']} rows={data.notifications.map(n=>[n.created_at,n.user_name||'Broadcast',n.title,n.message,n.read_at?'Yes':'No'])} empty="No notifications yet."/></section></>}
 {key==='settings'&&<><section className="ops-panel"><div className="panel-title"><div><h3>Google Sheets</h3><p>Send all users, students, events and event registrations to your Google Sheet automatically, with one tab per event.</p></div><a className="button button-primary" href={appPath('/admin/sheets')}>Add / manage Google Sheet</a></div></section><section className="ops-panel"><div className="panel-title"><div><h3>Operational settings</h3><p>Saved in the EventHub database and available after restart.</p></div></div><div className="settings-grid">{data.settings.map(s=><Setting key={s.key} row={s} disabled={busy} save={(value:string)=>post('/api/admin/settings',{key:s.key,value},'PATCH')}/>)}</div></section><section className="ops-note"><b>Roles & permissions</b><span>Super Admin has college-wide control. HOD is department-scoped. Main/Department Coordinators operate assigned events. Students only access their own participation records.</span></section></>}
 </div>}
function K({label,value}:{label:string,value:any}){return <article className="ops-kpi"><span>{label}</span><strong>{value}</strong></article>}
function EventTable({rows,empty,calendar=false}:{rows:any[],empty:string,calendar?:boolean}){return <section className="ops-panel table-scroll">{rows.length?<table className="ops-table"><thead><tr><th>Event</th><th>Date / Time</th><th>Venue</th><th>Department</th><th>Status</th><th>Registrations</th></tr></thead><tbody>{rows.map(e=><tr key={e.id}><td><b>{e.name}</b><small>{e.event_code} - {e.category}</small></td><td>{e.event_date}<small>{e.start_time}{e.end_time?` - ${e.end_time}`:''}</small></td><td>{e.venue}</td><td>{e.organizing_department}</td><td><span className="status-pill">{e.status}</span></td><td>{e.registration_count||0}</td></tr>)}</tbody></table>:<div className="ops-empty"><b>{empty}</b></div>}</section>}
function SimpleTable({headers,rows,empty}:{headers:string[],rows:any[][],empty:string}){return <div className="table-scroll">{rows.length?<table className="ops-table"><thead><tr>{headers.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={i}>{r.map((c,j)=><td key={j}>{c}</td>)}</tr>)}</tbody></table>:<div className="ops-empty">{empty}</div>}</div>}
function VenueForm({onAdd,disabled}:{onAdd:(x:any)=>void,disabled:boolean}){const [name,setName]=useState('');const [type,setType]=useState('Other');return <form className="ops-toolbar" onSubmit={e=>{e.preventDefault();if(name.trim()){onAdd({name,type});setName('')}}}><div><b>Add venue</b><span>Create a real venue used by event scheduling.</span></div><input value={name} onChange={e=>setName(e.target.value)} placeholder="Venue name" required/><select value={type} onChange={e=>setType(e.target.value)}><option>Auditorium</option><option>Seminar Hall</option><option>Classroom</option><option>Computer Lab</option><option>Library Hall</option><option>Sports Ground</option><option>Other</option></select><button className="primary-button" disabled={disabled}>+ Add Venue</button></form>}
function Rule({row,save,disabled}:{row:any,save:(n:number)=>void,disabled:boolean}){const [v,setV]=useState(String(row.points));return <div className="rule-card"><div><b>{row.label}</b><small>{row.code}</small></div><input type="number" value={v} onChange={e=>setV(e.target.value)}/><button disabled={disabled} onClick={()=>save(Number(v))}>Save</button></div>}
function Setting({row,save,disabled}:{row:any,save:(s:string)=>void,disabled:boolean}){const [v,setV]=useState(row.value||'');return <label className="setting-card"><span>{row.key.replaceAll('_',' ')}</span><div><input value={v} onChange={e=>setV(e.target.value)}/><button disabled={disabled} onClick={()=>save(v)}>Save</button></div></label>}
function NotificationForm({onSend,disabled}:{onSend:(x:any)=>void,disabled:boolean}){const [title,setTitle]=useState('');const [message,setMessage]=useState('');const [audience,setAudience]=useState('All Students');function submit(e:FormEvent){e.preventDefault();onSend({title,message,audience});setTitle('');setMessage('')}return <form className="ops-compose" onSubmit={submit}><div><span className="eyebrow">Compose</span><h3>Send student notification</h3><p>Send an in-app message to students, coordinators, or a selected department.</p></div><select value={audience} onChange={e=>setAudience(e.target.value)}>
  <optgroup label="Students">
    <option>All Students</option>
    <option>CSE</option>
    <option>Civil</option>
    <option>Mechanical</option>
    <option>Electrical</option>
    <option>EEE</option>
  </optgroup>

  <optgroup label="Coordinators">
    <option>All Coordinators</option>
    <option>Main Coordinators</option>
    <option>Department Coordinators</option>
    <option>CSE Coordinators</option>
    <option>Civil Coordinators</option>
    <option>Mechanical Coordinators</option>
    <option>Electrical Coordinators</option>
    <option>EEE Coordinators</option>
  </optgroup>
</select><input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Notification title" required/><textarea value={message} onChange={e=>setMessage(e.target.value)} placeholder="Message" required/><button className="primary-button" disabled={disabled}>Send Notification</button></form>}
