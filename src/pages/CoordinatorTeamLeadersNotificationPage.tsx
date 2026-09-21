import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthContext'



import { API } from '../lib/api'

type EventRow = {
  id:number
  name:string
  event_code:string
  status:string
}

type TeamRow = {
  id:number
  team_name?:string
  team_code?:string
  leader_student_id?:string
  leader?:{
    student_id?:string
    name?:string
  } | null
  status?:string
}

export default function CoordinatorTeamLeadersNotificationPage(){
  const {token} = useAuth()

  const [events,setEvents] = useState<EventRow[]>([])
  const [eventId,setEventId] = useState('')
  const [teams,setTeams] = useState<TeamRow[]>([])
  const [title,setTitle] = useState('')
  const [message,setMessage] = useState('')
  const [loading,setLoading] = useState(false)
  const [sending,setSending] = useState(false)
  const [error,setError] = useState('')
  const [success,setSuccess] = useState('')

  useEffect(()=>{
    async function loadEvents(){
      try{
        setError('')

        const response = await fetch(
          `${API}/api/events/manage`,
          {
            headers:{
              Authorization:`Bearer ${token}`
            }
          }
        )

        const data = await response.json()

        if(!response.ok){
          throw new Error(
            data.error || 'Unable to load events.'
          )
        }

        const rows:EventRow[] =
          data.rows || data.events || []

        setEvents(rows)

        if(rows[0]){
          setEventId(String(rows[0].id))
        }
      }catch(err:any){
        setError(
          err.message || 'Unable to load events.'
        )
      }
    }

    if(token) loadEvents()
  },[token])

  useEffect(()=>{
    async function loadTeams(){
      if(!eventId){
        setTeams([])
        return
      }

      setLoading(true)
      setError('')
      setSuccess('')

      try{
        const response = await fetch(
          `${API}/api/teams/manage?event_id=${encodeURIComponent(eventId)}`,
          {
            headers:{
              Authorization:`Bearer ${token}`
            }
          }
        )

        const data = await response.json()

        if(!response.ok){
          throw new Error(
            data.error || 'Unable to load teams.'
          )
        }

        const rows:TeamRow[] = data.rows || []

        setTeams(
          rows.filter(
            team=>team.status !== 'Rejected'
          )
        )
      }catch(err:any){
        setTeams([])
        setError(
          err.message || 'Unable to load teams.'
        )
      }finally{
        setLoading(false)
      }
    }

    if(token) loadTeams()
  },[eventId,token])

  const leaders = useMemo(()=>{
    const map = new Map<string,{
      studentId:string
      name:string
      teamName:string
    }>()

    teams.forEach(team=>{
      const studentId =
        team.leader?.student_id ||
        team.leader_student_id

      if(!studentId) return

      map.set(studentId,{
        studentId,
        name:
          team.leader?.name ||
          studentId,
        teamName:
          team.team_name ||
          team.team_code ||
          'Team'
      })
    })

    return [...map.values()]
  },[teams])

  const selectedEvent = events.find(
    event=>String(event.id) === eventId
  )

  async function send(event:FormEvent){
    event.preventDefault()

    if(
      !eventId ||
      leaders.length === 0 ||
      !title.trim() ||
      !message.trim()
    ){
      return
    }

    if(
      !window.confirm(
        `Send this message to ${leaders.length} team leader(s)?`
      )
    ){
      return
    }

    setSending(true)
    setError('')
    setSuccess('')

    try{
      const response = await fetch(
        `${API}/api/coordinator/notifications/team-leaders`,
        {
          method:'POST',
          headers:{
            Authorization:`Bearer ${token}`,
            'Content-Type':'application/json'
          },
          body:JSON.stringify({
            event_id:Number(eventId),
            title:title.trim(),
            message:message.trim()
          })
        }
      )

      const data = await response.json()

      if(!response.ok){
        throw new Error(
          data.error ||
          'Unable to send team instructions.'
        )
      }

      setSuccess(
        `${data.message}${
          data.skipped
            ? ` ${data.skipped} leader(s) had no active student login and were skipped.`
            : ''
        }`
      )

      setTitle('')
      setMessage('')
    }catch(err:any){
      setError(
        err.message ||
        'Unable to send team instructions.'
      )
    }finally{
      setSending(false)
    }
  }

  return (
    <div className="page-stack coordinator-registered-notification-page">

      <section className="page-hero compact">
        <div>
          <span className="eyebrow">
            Event Communication
          </span>

          <h2>Team Leaders</h2>

          <p>
            Send team-level instructions directly to
            registered team leaders.
          </p>
        </div>
      </section>

      <section className="panel communication-event-panel">

        <div className="communication-section-heading">
          <div>
            <span className="eyebrow">
              Audience
            </span>

            <h3>Select Event</h3>

            <p>
              Select an event to find its team leaders.
            </p>
          </div>

          <div className="communication-recipient-count">
            <strong>{leaders.length}</strong>
            <span>Team Leaders</span>
          </div>
        </div>

        <label className="communication-field">
          <span>Event</span>

          <select
            value={eventId}
            onChange={e=>setEventId(e.target.value)}
          >
            <option value="">
              Select event
            </option>

            {events.map(event=>(
              <option
                value={event.id}
                key={event.id}
              >
                {event.name} - {event.event_code} - {event.status}
              </option>
            ))}
          </select>
        </label>

        {selectedEvent && (
          <div className="communication-event-summary">
            <div>
              <span>Selected Event</span>
              <strong>
                {selectedEvent.name}
              </strong>
            </div>

            <div>
              <span>Teams Found</span>
              <strong>{teams.length}</strong>
            </div>

            <div>
              <span>Team Leaders</span>
              <strong>{leaders.length}</strong>
            </div>
          </div>
        )}

        {loading && (
          <p className="muted">
            Loading team leaders...
          </p>
        )}

        {!loading &&
          eventId &&
          leaders.length === 0 && (
            <div className="communication-empty-state">
              <strong>
                No registered team leaders found for this event.
              </strong>

              <span>
                Team leaders will appear here after teams
                are created and registered for this event.
              </span>
            </div>
          )}

        {!loading && leaders.length > 0 && (
          <div
            style={{
              marginTop:20,
              display:'grid',
              gap:10
            }}
          >
            {leaders.map(leader=>(
              <div
                key={leader.studentId}
                style={{
                  padding:'14px 16px',
                  border:'1px solid #dbe6f3',
                  borderRadius:12
                }}
              >
                <strong>{leader.name}</strong>

                <div className="muted">
                  {leader.studentId} - {leader.teamName}
                </div>
              </div>
            ))}
          </div>
        )}

      </section>

      <section className="panel communication-compose-panel">

        <div className="communication-section-heading">
          <div>
            <span className="eyebrow">
              Message
            </span>

            <h3>Compose Team Instructions</h3>

            <p>
              One notification is sent to each unique
              team leader.
            </p>
          </div>
        </div>

        <form
          className="communication-compose-form"
          onSubmit={send}
        >

          <label className="communication-field">
            <span>Subject</span>

            <input
              value={title}
              onChange={e=>setTitle(e.target.value)}
              placeholder="Example: Team reporting instructions"
              maxLength={120}
              required
            />
          </label>

          <label className="communication-field">
            <span>Message</span>

            <textarea
              value={message}
              onChange={e=>setMessage(e.target.value)}
              placeholder="Write instructions for team leaders..."
              rows={7}
              maxLength={1500}
              required
            />
          </label>

          <div className="communication-send-row">

            <div>
              {error && (
                <p className="form-error">
                  {error}
                </p>
              )}

              {success && (
                <p className="form-success">
                  {success}
                </p>
              )}
            </div>

            <button
              type="submit"
              className="button button-primary"
              disabled={
                sending ||
                !eventId ||
                leaders.length === 0 ||
                !title.trim() ||
                !message.trim()
              }
            >
              {sending
                ? 'Sending...'
                : 'Send Team Instructions'}
            </button>

          </div>
        </form>
      </section>

    </div>
  )
}
