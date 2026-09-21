import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthContext'

import { API } from '../lib/api'

type EventRow = {
  id:number
  event_code:string
  name:string
  status:string
  organizing_department?:string
}

type RegistrationRow = {
  id:number
  status:string
  registration_type:string
  student_id?:string | null
  team_id?:number | null
  subject?:{
    student_id?:string
    name?:string
    id?:number
    team_name?:string
    team_code?:string
    members?:Array<{
      student_id?:string
      status?:string
    }>
  } | null

  // Compatibility with older registration payloads.
  student?:{
    student_id?:string
    name?:string
  } | null
  team?:{
    id?:number
    team_name?:string
    team_code?:string
    members?:Array<{
      student_id?:string
      status?:string
    }>
  } | null
}

export default function CoordinatorRegisteredStudentsNotificationPage(){
  const { token } = useAuth()

  const [events,setEvents] = useState<EventRow[]>([])
  const [eventId,setEventId] = useState('')
  const [registrations,setRegistrations] = useState<RegistrationRow[]>([])
  const [title,setTitle] = useState('')
  const [message,setMessage] = useState('')
  const [loading,setLoading] = useState(false)
  const [sending,setSending] = useState(false)
  const [error,setError] = useState('')
  const [success,setSuccess] = useState('')

  const headers = useMemo(
    ()=>({
      Authorization:`Bearer ${token}`,
      'Content-Type':'application/json'
    }),
    [token]
  )

  useEffect(()=>{
    async function loadEvents(){
      setError('')

      try{
        const response = await fetch(
          `${API}/api/events/manage`,
          {headers:{Authorization:`Bearer ${token}`}}
        )

        const data = await response.json()

        if(!response.ok){
          throw new Error(data.error || 'Unable to load events.')
        }

        const rows:EventRow[] = data.rows || data.events || []

        setEvents(rows)

        if(rows[0]){
          setEventId(String(rows[0].id))
        }
      }catch(err:any){
        setError(err.message || 'Unable to load events.')
      }
    }

    if(token) loadEvents()
  },[token])

  useEffect(()=>{
    async function loadRegistrations(){
      if(!eventId){
        setRegistrations([])
        return
      }

      setLoading(true)
      setError('')
      setSuccess('')

      try{
        const response = await fetch(
          `${API}/api/registrations/manage?event_id=${encodeURIComponent(eventId)}`,
          {headers:{Authorization:`Bearer ${token}`}}
        )

        const data = await response.json()

        if(!response.ok){
          throw new Error(data.error || 'Unable to load registrations.')
        }

        const rows:RegistrationRow[] = (data.rows || []).filter(
          (row:RegistrationRow)=>
            !['Cancelled','Rejected'].includes(row.status)
        )

        setRegistrations(rows)
      }catch(err:any){
        setRegistrations([])
        setError(err.message || 'Unable to load registrations.')
      }finally{
        setLoading(false)
      }
    }

    if(token) loadRegistrations()
  },[eventId,token])

  const participantCount = useMemo(()=>{
    const ids = new Set<string>()

    registrations.forEach(registration=>{
      if(registration.registration_type === 'Individual'){
        const studentId =
          registration.subject?.student_id ||
          registration.student?.student_id ||
          registration.student_id

        if(studentId){
          ids.add(studentId)
        }

        return
      }

      const members =
        registration.subject?.members ||
        registration.team?.members ||
        []

      members.forEach(member=>{
        if(
          member.student_id &&
          member.status !== 'Declined'
        ){
          ids.add(member.student_id)
        }
      })
    })

    return ids.size
  },[registrations])

  async function send(e:FormEvent){
    e.preventDefault()

    if(!eventId || !title.trim() || !message.trim()) return

    if(
      !window.confirm(
        `Send this notification to all registered participants of the selected event?`
      )
    ) return

    setSending(true)
    setError('')
    setSuccess('')

    try{
      const response = await fetch(
        `${API}/api/coordinator/notifications/registered`,
        {
          method:'POST',
          headers,
          body:JSON.stringify({
            event_id:Number(eventId),
            title:title.trim(),
            message:message.trim()
          })
        }
      )

      const data = await response.json()

      if(!response.ok){
        throw new Error(data.error || 'Unable to send notification.')
      }

      setSuccess(
        `${data.message}${data.skipped ? ` ${data.skipped} participant(s) had no active student login and were skipped.` : ''}`
      )

      setTitle('')
      setMessage('')
    }catch(err:any){
      setError(err.message || 'Unable to send notification.')
    }finally{
      setSending(false)
    }
  }

  const selectedEvent = events.find(
    event=>String(event.id) === eventId
  )

  return (
    <div className="page-stack coordinator-registered-notification-page">
      <section className="page-hero compact">
        <div>
          <span className="eyebrow">Event Communication</span>
          <h2>Registered Students</h2>
          <p>
            Send one in-app notification to all registered participants
            of an event.
          </p>
        </div>
      </section>

      <section className="panel communication-event-panel">
        <div className="communication-section-heading">
          <div>
            <span className="eyebrow">Audience</span>
            <h3>Select Event</h3>
            <p>
              Only events you are permitted to coordinate are available.
            </p>
          </div>

          <div className="communication-recipient-count">
            <strong>{participantCount}</strong>
            <span>Registered Participants</span>
          </div>
        </div>

        <label className="communication-field">
          <span>Event</span>
          <select
            value={eventId}
            onChange={e=>setEventId(e.target.value)}
          >
            <option value="">Select event</option>
            {events.map(event=>(
              <option value={event.id} key={event.id}>
                {event.name} • {event.event_code} • {event.status}
              </option>
            ))}
          </select>
        </label>

        {selectedEvent && (
          <div className="communication-event-summary">
            <div>
              <span>Selected Event</span>
              <strong>{selectedEvent.name}</strong>
            </div>

            <div>
              <span>Event Code</span>
              <strong>{selectedEvent.event_code}</strong>
            </div>

            <div>
              <span>Status</span>
              <strong>{selectedEvent.status}</strong>
            </div>
          </div>
        )}

        {loading && (
          <p className="muted">Loading registered participants...</p>
        )}
      </section>

      <section className="panel communication-compose-panel">
        <div className="communication-section-heading">
          <div>
            <span className="eyebrow">Message</span>
            <h3>Compose Notification</h3>
            <p>
              The notification will appear in each recipient's
              EventHub notification inbox.
            </p>
          </div>
        </div>

        <form onSubmit={send} className="communication-compose-form">
          <label className="communication-field">
            <span>Subject</span>
            <input
              value={title}
              onChange={e=>setTitle(e.target.value)}
              placeholder="Example: Reporting time updated"
              maxLength={120}
              required
            />
          </label>

          <label className="communication-field">
            <span>Message</span>
            <textarea
              value={message}
              onChange={e=>setMessage(e.target.value)}
              placeholder="Write the message for registered participants..."
              rows={7}
              maxLength={1500}
              required
            />
          </label>

          <div className="communication-send-row">
            <div>
              {error && <p className="form-error">{error}</p>}
              {success && <p className="form-success">{success}</p>}
            </div>

            <button
              className="button button-primary"
              type="submit"
              disabled={
                sending ||
                !eventId ||
                !title.trim() ||
                !message.trim() ||
                participantCount === 0
              }
            >
              {sending ? 'Sending...' : 'Send Notification'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

