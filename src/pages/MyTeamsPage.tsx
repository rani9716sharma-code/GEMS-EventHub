import { useEffect, useState } from 'react'
import { API, useAuth } from '../auth/AuthContext'
import { appPath } from '../lib/paths'

type Member={student_id:string;name:string;department:string;year:number;role:string;status:string}
type Team={id:number;event_id:number;event_name:string;event_code:string;team_name:string;team_code:string;leader_student_id:string;leader_name:string;status:string;review_comment?:string|null;team_min:number;team_max:number;members:Member[]}
type EventOption={id:number;name:string;event_code:string;event_date:string;team_min:number;team_max:number;participation_type:string;allow_student_teams:boolean}
type Invitation={id:number;team_name:string;team_code:string;event_name:string;status:string;leader_name:string}

export default function MyTeamsPage(){
  const {token,user}=useAuth()
  const [events,setEvents]=useState<EventOption[]>([])
  const [teams,setTeams]=useState<Team[]>([])
  const [invitations,setInvitations]=useState<Invitation[]>([])

  const [memberInputs,setMemberInputs]=useState<Record<number,string>>({})
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')

  async function load(){
    setError('')
    try{
      const [er,tr]=await Promise.all([
        fetch(`${API}/api/team-events`,{headers:{Authorization:`Bearer ${token}`}}),
        fetch(`${API}/api/teams/my`,{headers:{Authorization:`Bearer ${token}`}}),
      ])
      const ed=await er.json(),td=await tr.json()
      if(!er.ok) throw new Error(ed.error||'Could not load team events.')
      if(!tr.ok) throw new Error(td.error||'Could not load your teams.')
      setEvents(ed.rows||[]);setTeams(td.rows||[]);setInvitations(td.invitations||[])
    }catch(e){setError(e instanceof Error?e.message:'Could not load team data.')}
  }
  useEffect(()=>{load()},[token])

  async function addMember(teamId:number){
    const sid=(memberInputs[teamId]||'').trim();if(!sid)return
    setBusy(true);setError('');try{const r=await fetch(`${API}/api/teams/${teamId}/members`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({student_id:sid})});const d=await r.json();if(!r.ok)throw new Error(d.error);setMemberInputs(p=>({...p,[teamId]:''}));await load()}catch(e){setError(e instanceof Error?e.message:'Could not add member.')}finally{setBusy(false)}
  }
  async function submitTeam(teamId:number){
    setBusy(true);setError('');try{const r=await fetch(`${API}/api/teams/${teamId}/submit`,{method:'POST',headers:{Authorization:`Bearer ${token}`}});const d=await r.json();if(!r.ok)throw new Error(d.error);setMessage('Team submitted to the coordinator for approval.');await load()}catch(e){setError(e instanceof Error?e.message:'Could not submit team.')}finally{setBusy(false)}
  }
  async function respond(teamId:number,action:'accept'|'decline'){
    if(!user?.student_id)return;setBusy(true);setError('');try{const r=await fetch(`${API}/api/teams/${teamId}/members/${encodeURIComponent(user.student_id)}/respond`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({action})});const d=await r.json();if(!r.ok)throw new Error(d.error);setMessage(action==='accept'?'Team invitation accepted.':'Team invitation declined.');await load()}catch(e){setError(e instanceof Error?e.message:'Could not update invitation.')}finally{setBusy(false)}
  }

  return <section className="portal-content team-page">
    <div className="page-toolbar"><div><span className="eyebrow">Student teams</span><h2>My Teams</h2><p>Teams are created by coordinators from individually registered students. If you are assigned as Team Leader, you can add registered students and submit the team.</p></div></div>
    {error&&<div className="form-alert error">{error}</div>}{message&&<div className="form-alert success">{message}</div>}

    {invitations.length>0&&<div className="team-section"><div className="section-mini-head"><div><span className="eyebrow">Action required</span><h3>Team Invitations</h3></div><span className="count-badge">{invitations.length}</span></div><div className="team-grid">{invitations.map(i=><article className="team-card invitation" key={i.id}><div className="team-card-top"><span className="team-icon">INV</span><span className="event-status status-submitted">Invited</span></div><h3>{i.team_name}</h3><p>{i.event_name}</p><div className="team-code">Code <b>{i.team_code}</b></div><small>Leader: {i.leader_name}</small><div className="team-card-actions"><button className="button button-primary button-small" disabled={busy} onClick={()=>respond(i.id,'accept')}>Accept</button><button className="button button-ghost button-small" disabled={busy} onClick={()=>respond(i.id,'decline')}>Decline</button></div></article>)}</div></div>}

    <div className="team-layout">
      <div className="team-create-card team-process-card">
        <span className="eyebrow">How team formation works</span>
        <h3>Coordinator Assigned Teams</h3>
        <p>Register for the event individually first. After registration, the Event Coordinator will create the team and assign one registered student as the Team Leader.</p>
        <div className="event-rule-strip team-formation-steps">
          <div className="team-formation-step">
            <strong>1</strong>
            <div>
              <span>Register Individually</span>
              <small>First, register for the event from the Explore Events page.</small>
            </div>
          </div>

          <div className="team-formation-step">
            <strong>2</strong>
            <div>
              <span>Coordinator Assigns Leader</span>
              <small>The Event Coordinator creates the team and assigns a registered student as the Team Leader.</small>
            </div>
          </div>

          <div className="team-formation-step">
            <strong>3</strong>
            <div>
              <span>Leader Adds Registered Members</span>
              <small>The Team Leader can then add other registered students to the team.</small>
            </div>
          </div>
        </div>
        <div className="form-alert team-formation-note">
          <strong>i</strong>
          <span>Note: A student can be part of only one team in the same event.</span>
        </div>
      </div>

      <div className="team-section"><div className="section-mini-head"><div><span className="eyebrow">Your participation</span><h3>Current Teams</h3></div><span className="count-badge">{teams.length}</span></div>{teams.length===0?<div className="empty-state compact team-empty-state">
  <div className="team-empty-symbol" aria-hidden="true">
    <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  </div>

  <h3>No teams assigned yet</h3>

  <p>
    Register for an eligible event first. Once the coordinator creates or
    assigns your team, it will appear here.
  </p>

  <a className="button button-primary team-browse-events" href={appPath('/student/explore')}>
    Browse Events
  </a>
</div>:<div className="team-stack">{teams.map(team=><article className="team-detail-card" key={team.id}>
        <div className="team-title-row"><div><span>{team.event_code}</span><h3>{team.team_name}</h3><p>{team.event_name}</p></div><span className={`event-status status-${team.status.toLowerCase().replaceAll(' ','-')}`}>{team.status}</span></div>
        <div className="team-summary-row"><div><small>Team Code</small><b>{team.team_code}</b></div><div><small>Members</small><b>{team.members.filter(m=>m.status!=='Declined').length} / {team.team_max}</b></div><div><small>Leader</small><b>{team.leader_name}</b></div></div>
        {team.review_comment&&<div className="approval-note">Coordinator note: {team.review_comment}</div>}
        <div className="member-list">{team.members.map(m=><div key={m.student_id}><span className="member-avatar">{m.name.slice(0,1)}</span><div><b>{m.name}</b><small>{m.student_id} | {m.department} | Year {m.year}</small></div><span className={`member-state ${m.status.toLowerCase()}`}>{m.role==='Leader'?'Leader':m.status}</span></div>)}</div>
        {team.leader_student_id===user?.student_id&&['Draft','Changes Requested'].includes(team.status)&&<div className="team-manage-row"><input value={memberInputs[team.id]||''} onChange={e=>setMemberInputs(p=>({...p,[team.id]:e.target.value}))} placeholder="Add member by Student ID"/><button className="button button-ghost button-small" disabled={busy} onClick={()=>addMember(team.id)}>Add</button><button className="button button-primary button-small" disabled={busy} onClick={()=>submitTeam(team.id)}>Submit Team</button></div>}
      </article>)}</div>}</div>
    </div>
  </section>
}



