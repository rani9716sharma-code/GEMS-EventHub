import { FormEvent, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'



import { API } from '../lib/api'

type EventRow = {
  id:number
  name:string
  event_code:string
  status:string
}

type Recipient = {
  student_id:string
  name?:string
  roll_no?:string
  department?:string
  year?:string | number
  semester?:string | number
}

type Audience = 'Attendees' | 'Winners'

export default function CoordinatorAttendeesWinnersNotificationPage(){
  const {token} = useAuth()

  const [events,setEvents] = useState<EventRow[]>([])
  const [eventId,setEventId] = useState('')
  const [audience,setAudience] = useState<Audience>('Attendees')
  const [recipients,setRecipients] = useState<Recipient[]>([])
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
          throw new Error(data.error || 'Unable to load events.')
        }

        const rows:EventRow[] =
          data.rows || data.events || []

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
    async function loadRecipients(){
      if(!eventId){
        setRecipients([])
        return
      }

      setLoading(true)
      setError('')
      setSuccess('')

      try{
        const response = await fetch(
          `${API}/api/coordinator/notifications/post-event-audience?event_id=${encodeURIComponent(eventId)}&audience=${encodeURIComponent(audience)}`,
          {
            headers:{
              Authorization:`Bearer ${token}`
            }
          }
        )

        const data = await response.json()

        if(!response.ok){
          throw new Error(
            data.error || 'Unable to load recipients.'
          )
        }

        setRecipients(data.rows || [])
      }catch(err:any){
        setRecipients([])
        setError(
          err.message || 'Unable to load recipients.'
        )
      }finally{
        setLoading(false)
      }
    }

    if(token) loadRecipients()
  },[eventId,audience,token])

  const selectedEvent = events.find(
    event=>String(event.id) === eventId
  )

  async function send(event:FormEvent){
    event.preventDefault()

    if(
      !eventId ||
      recipients.length === 0 ||
      !title.trim() ||
      !message.trim()
    ){
      return
    }

    const label =
      audience === 'Attendees'
        ? 'attendee(s)'
        : 'winner(s)'

    if(
      !window.confirm(
        `Send this message to ${recipients.length} ${label}?`
      )
    ){
      return
    }

    setSending(true)
    setError('')
    setSuccess('')

    try{
      const response = await fetch(
        `${API}/api/coordinator/notifications/post-event-audience`,
        {
          method:'POST',
          headers:{
            Authorization:`Bearer ${token}`,
            'Content-Type':'application/json'
          },
          body:JSON.stringify({
            event_id:Number(eventId),
            audience,
            title:title.trim(),
            message:message.trim()
          })
        }
      )

      const data = await response.json()

      if(!response.ok){
        throw new Error(
          data.error || 'Unable to send message.'
        )
      }

      setSuccess(
        `${data.message}${
          data.skipped
            ? ` ${data.skipped} recipient(s) had no active Student login and were skipped.`
            : ''
        }`
      )

      setTitle('')
      setMessage('')
    }catch(err:any){
      setError(err.message || 'Unable to send message.')
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

          <h2>Attendees &amp; Winners</h2>

          <p>
            Send post-event updates, result information
            and certificate-related messages.
          </p>
        </div>
      </section>

      <section className="panel communication-event-panel">

        <div className="communication-section-heading">
          <div>
            <span className="eyebrow">Audience</span>
            <h3>Select Recipients</h3>
            <p>
              Choose an event and then select attendees
              or published winners.
            </p>
          </div>

          <div className="communication-recipient-count">
            <strong>{recipients.length}</strong>
            <span>{audience}</span>
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
              <option
                key={event.id}
                value={event.id}
              >
                {event.name} - {event.event_code} - {event.status}
              </option>
            ))}
          </select>
        </label>

        <label className="communication-field">
          <span>Recipient Group</span>

          <select
            value={audience}
            onChange={e=>setAudience(e.target.value as Audience)}
          >
            <option value="Attendees">
              Attendees
            </option>

            <option value="Winners">
              Winners
            </option>
          </select>
        </label>

        {selectedEvent && (
          <div className="communication-event-summary">

            <div>
              <span>Selected Event</span>
              <strong>{selectedEvent.name}</strong>
            </div>

            <div>
              <span>Audience</span>
              <strong>{audience}</strong>
            </div>

            <div>
              <span>Recipients</span>
              <strong>{recipients.length}</strong>
            </div>

          </div>
        )}

        {loading && (
          <p className="muted">
            Loading recipients...
          </p>
        )}

        {!loading &&
          eventId &&
          recipients.length === 0 && (
            <div className="communication-empty-state">
              <strong>
                {audience === 'Attendees'
                  ? 'No attendees found for this event.'
                  : 'No published winners found for this event.'}
              </strong>

              <span>
                {audience === 'Attendees'
                  ? 'Students marked Present in attendance will appear here.'
                  : 'Students or team members from published results will appear here.'}
              </span>
            </div>
          )}

        {!loading && recipients.length > 0 && (
          <div
            style={{
              display:'grid',
              gap:10,
              marginTop:20
            }}
          >
            {recipients.map(student=>(
              <div
                key={student.student_id}
                style={{
                  padding:'14px 16px',
                  border:'1px solid #dbe6f3',
                  borderRadius:12
                }}
              >
                <strong>
                  {student.name || student.student_id}
                </strong>

                <div className="muted">
                  {student.student_id}
                  {student.roll_no
                    ? ` | Roll: ${student.roll_no}`
                    : ''}
                  {student.department
                    ? ` | ${student.department}`
                    : ''}
                </div>
              </div>
            ))}
          </div>
        )}

      </section>

      <section className="panel communication-compose-panel">

        <div className="communication-section-heading">
          <div>
            <span className="eyebrow">Message</span>

            <h3>
              Compose {audience} Message
            </h3>

            <p>
              This sends an In-App notification only.
              Attendance, results and certificates are
              not modified.
            </p>
          </div>
        </div>

        <form
          onSubmit={send}
          className="communication-compose-form"
        >

          <label className="communication-field">
            <span>Subject</span>

            <input
              value={title}
              onChange={e=>setTitle(e.target.value)}
              placeholder={
                audience === 'Attendees'
                  ? 'Example: Participation certificate update'
                  : 'Example: Result and winner certificate update'
              }
              maxLength={120}
              required
            />
          </label>

          <label className="communication-field">
            <span>Message</span>

            <textarea
              value={message}
              onChange={e=>setMessage(e.target.value)}
              placeholder="Write the post-event message..."
              rows={7}
              maxLength={1500}
              required
            />
          </label>

          <div className="communication-send-row">

            <div>
              {error && (
                <p className="form-error">{error}</p>
              )}

              {success && (
                <p className="form-success">{success}</p>
              )}
            </div>

            <button
              type="submit"
              className="button button-primary"
              disabled={
                sending ||
                !eventId ||
                recipients.length === 0 ||
                !title.trim() ||
                !message.trim()
              }
            >
              {sending
                ? 'Sending...'
                : `Send to ${audience}`}
            </button>

          </div>
        </form>

      </section>
    </div>
  )
}
