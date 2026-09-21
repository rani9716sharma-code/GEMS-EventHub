import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { API, useAuth } from '../auth/AuthContext'

type EventRow={
  id:number
  status:string
  event_code:string
  name:string
  category:string
  organizing_department:string
  event_date:string
  start_time:string
  end_time?:string|null
  venue:string
  payment_type:string
  fee:number
  seats_remaining?:number|null
  registration_open_now:boolean
}

type Registration={
  id:number
  status:string
  event:{
    id:number
    name:string
    event_date:string
  }
}

type Team={
  id:number
  status:string
  event_name?:string
}

type Notification={
  id:number
  title:string
  message:string
  created_at:string
}

function eventStart(event:EventRow){
  return new Date(`${event.event_date}T${event.start_time || '00:00'}:00`)
}

function eventEnd(event:EventRow){
  if(event.end_time){
    return new Date(`${event.event_date}T${event.end_time}:00`)
  }

  return new Date(`${event.event_date}T23:59:59`)
}

function formatEventDate(value:string){
  return new Date(`${value}T00:00:00`).toLocaleDateString(
    'en-IN',
    {
      day:'2-digit',
      month:'short',
      year:'numeric'
    }
  )
}

function formatTime(value?:string|null){
  if(!value) return ''

  const [hour,minute] = value.split(':').map(Number)

  const date = new Date()
  date.setHours(hour,minute,0,0)

  return date.toLocaleTimeString(
    'en-IN',
    {
      hour:'2-digit',
      minute:'2-digit'
    }
  )
}

export default function StudentDashboard(){
  const {token,user}=useAuth()

  const [events,setEvents]=useState<EventRow[]>([])
  const [regs,setRegs]=useState<Registration[]>([])
  const [teams,setTeams]=useState<Team[]>([])
  const [notifications,setNotifications]=useState<Notification[]>([])
  const [error,setError]=useState('')

  useEffect(()=>{
    ;(async()=>{
      try{
        const [er,rr,tr,nr]=await Promise.all([
          fetch(
            `${API}/api/registration-events`,
            {
              headers:{
                Authorization:`Bearer ${token}`
              }
            }
          ),

          fetch(
            `${API}/api/registrations/my`,
            {
              headers:{
                Authorization:`Bearer ${token}`
              }
            }
          ),

          fetch(
            `${API}/api/teams/my`,
            {
              headers:{
                Authorization:`Bearer ${token}`
              }
            }
          ),

          fetch(
            `${API}/api/notifications`,
            {
              headers:{
                Authorization:`Bearer ${token}`
              }
            }
          )
        ])

        const [ed,rd,td,nd]=await Promise.all([
          er.json(),
          rr.json(),
          tr.json(),
          nr.json()
        ])

        if(!er.ok){
          throw new Error(
            ed.error || 'Could not load events.'
          )
        }

        if(!rr.ok){
          throw new Error(
            rd.error || 'Could not load registrations.'
          )
        }

        setEvents(ed.rows || [])
        setRegs(rd.rows || [])
        setTeams(td.rows || [])
        setNotifications(nd.rows || [])
      }catch(e){
        setError(
          e instanceof Error
            ? e.message
            : 'Could not load dashboard data.'
        )
      }
    })()
  },[token])

  const activeRegs=regs.filter(
    r=>!['Cancelled','Rejected'].includes(r.status)
  )

  const pendingPayment=regs.filter(
    r=>r.status==='Payment Pending'
  ).length

  const waitingApproval=regs.filter(
    r=>r.status==='Waiting for Approval'
  ).length

  const confirmed=regs.filter(
    r=>r.status==='Confirmed'
  ).length

  const teamInvites=teams.filter(
    t=>t.status==='Pending'
  ).length

  const {ongoingEvents,upcomingEvents}=useMemo(()=>{
    const now=new Date()

    const ongoing=events
      .filter(event=>{
        const start=eventStart(event)
        const end=eventEnd(event)

        return (
          !Number.isNaN(start.getTime()) &&
          !Number.isNaN(end.getTime()) &&
          now>=start &&
          now<=end
        )
      })
      .sort(
        (a,b)=>eventStart(a).getTime()-eventStart(b).getTime()
      )

    const upcoming=events
      .filter(event=>{
        const start=eventStart(event)

        return (
          !Number.isNaN(start.getTime()) &&
          start>now
        )
      })
      .sort(
        (a,b)=>eventStart(a).getTime()-eventStart(b).getTime()
      )

    return {
      ongoingEvents:ongoing,
      upcomingEvents:upcoming
    }
  },[events])

  const upcomingPreview=upcomingEvents.slice(0,3)

  return (
    <section className="portal-content student-dashboard-rich">

      <div className="student-welcome-rich">
        <div>
          <span className="eyebrow">
            Student experience
          </span>

          <h2>
            Welcome back, {user?.name?.split(' ')[0]}.
          </h2>

          <p>
            See what is happening at GEMS right now and
            discover your next eligible events.
          </p>
        </div>

        <Link
          className="button button-primary"
          to="/student/explore"
        >
          Explore Events
        </Link>
      </div>

      {error&&(
        <div className="form-alert error">
          {error}
        </div>
      )}

      <section className="student-event-focus">

        <div className="student-event-focus-head">
          <div>
            <span className="eyebrow">
              Happening at GEMS
            </span>

            <h3>
              Current & Upcoming Events
            </h3>

            <p>
              Live events and your nearest upcoming
              opportunities appear here automatically.
            </p>
          </div>

          <Link to="/student/explore">
            View all events
          </Link>
        </div>

        <div className="student-live-section">

          <div className="student-event-section-title">
            <span className="student-live-dot"/>
            <strong>ONGOING NOW</strong>
            <small>{ongoingEvents.length}</small>
          </div>

          {ongoingEvents.length ? (
            <div className="student-live-events">
              {ongoingEvents.map(event=>(
                <article
                  className="student-live-event-card"
                  key={event.id}
                >
                  <div className="student-event-state">
                    LIVE NOW
                  </div>

                  <div className="student-live-event-main">
                    <small>
                      {event.event_code} - {event.category}
                    </small>

                    <h4>{event.name}</h4>

                    <div className="student-event-meta">
                      <span>
                        {formatEventDate(event.event_date)}
                      </span>

                      <span>
                        {formatTime(event.start_time)}
                        {event.end_time
                          ? ` - ${formatTime(event.end_time)}`
                          : ''
                        }
                      </span>

                      <span>
                        {event.venue}
                      </span>
                    </div>
                  </div>

                  <div className="student-event-actions">
                    <Link
                      className="button button-primary"
                      to={`/student/explore?event=${event.id}`}
                    >
                      {event.registration_open_now
                        ? 'View / Register'
                        : 'View Event'
                      }
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          ):(
            <div className="student-no-live-event">
              <strong>No event is live right now</strong>
              <span>
                Your next published event will appear below.
              </span>
            </div>
          )}

        </div>

        <div className="student-upcoming-section">

          <div className="student-event-section-title">
            <strong>UPCOMING EVENTS</strong>
            <small>{upcomingEvents.length}</small>
          </div>

          {upcomingPreview.length ? (
            <div className="student-upcoming-grid">

              {upcomingPreview.map(event=>(
                <article
                  className="student-upcoming-card"
                  key={event.id}
                >

                  <div className="student-upcoming-date">
                    <strong>
                      {new Date(
                        `${event.event_date}T00:00:00`
                      ).toLocaleDateString(
                        'en-IN',
                        {day:'2-digit'}
                      )}
                    </strong>

                    <span>
                      {new Date(
                        `${event.event_date}T00:00:00`
                      ).toLocaleDateString(
                        'en-IN',
                        {month:'short'}
                      )}
                    </span>
                  </div>

                  <div className="student-upcoming-info">
                    <small>
                      {event.category}
                    </small>

                    <h4>
                      {event.name}
                    </h4>

                    <p>
                      {formatTime(event.start_time)}
                      {event.end_time
                        ? ` - ${formatTime(event.end_time)}`
                        : ''
                      }
                    </p>

                    <p>
                      {event.venue}
                    </p>

                    <div className="student-upcoming-footer">
                      <span
                        className={
                          event.registration_open_now
                            ? 'registration-open-label'
                            : 'registration-closed-label'
                        }
                      >
                        {event.registration_open_now
                          ? 'Registration Open'
                          : 'View Details'
                        }
                      </span>

                      <Link
                        to={`/student/explore?event=${event.id}`}
                      >
                        Open Event
                      </Link>
                    </div>
                  </div>

                </article>
              ))}

            </div>
          ):(
            <div className="student-no-upcoming-event">
              No upcoming published events are available
              for your profile right now.
            </div>
          )}

        </div>

      </section>

      <div className="student-dashboard-metrics">

        <Link to="/student/explore">
          <small>Eligible events</small>
          <strong>{events.length}</strong>
          <span>Published for you</span>
        </Link>

        <Link to="/student/registrations">
          <small>Active registrations</small>
          <strong>{activeRegs.length}</strong>
          <span>{confirmed} confirmed</span>
        </Link>

        <Link to="/student/payments">
          <small>Payments pending</small>
          <strong>{pendingPayment}</strong>
          <span>Complete paid entries</span>
        </Link>

        <Link to="/student/registrations">
          <small>Waiting approval</small>
          <strong>{waitingApproval}</strong>
          <span>Coordinator review</span>
        </Link>

        <Link to="/student/teams">
          <small>Team activity</small>
          <strong>{teams.length}</strong>
          <span>{teamInvites} pending</span>
        </Link>

        <Link to="/student/notifications">
          <small>Notifications</small>
          <strong>{notifications.length}</strong>
          <span>Latest updates</span>
        </Link>

      </div>

      <div className="student-dashboard-columns">

        <section className="dashboard-panel">

          <div className="section-mini-head">
            <div>
              <span className="eyebrow">
                My Events
              </span>

              <h3>
                Registration Activity
              </h3>
            </div>

            <Link to="/student/registrations">
              View registrations
            </Link>
          </div>

          {regs.length ? (
            <div className="dashboard-activity-list">

              {regs.slice(0,4).map(r=>(
                <article key={r.id}>
                  <div>
                    <b>{r.event.name}</b>
                    <small>{r.event.event_date}</small>
                  </div>

                  <span
                    className={
                      `event-status status-${r.status
                        .toLowerCase()
                        .replaceAll(' ','-')}`
                    }
                  >
                    {r.status}
                  </span>
                </article>
              ))}

            </div>
          ):(
            <div className="mini-empty action-empty">
              <b>No registrations yet</b>

              <p>
                Your event journey starts from Explore.
              </p>

              <Link to="/student/explore">
                Find an event
              </Link>
            </div>
          )}

        </section>

        <section className="dashboard-panel">

          <div className="section-mini-head">
            <div>
              <span className="eyebrow">
                Updates
              </span>

              <h3>
                Latest Notifications
              </h3>
            </div>

            <Link to="/student/notifications">
              View all
            </Link>
          </div>

          {notifications.length ? (
            <div className="student-dashboard-notifications">

              {notifications.slice(0,4).map(notification=>(
                <article key={notification.id}>
                  <div>
                    <b>{notification.title}</b>
                    <p>{notification.message}</p>
                  </div>

                  <small>
                    {new Date(
                      notification.created_at
                    ).toLocaleDateString('en-IN')}
                  </small>
                </article>
              ))}

            </div>
          ):(
            <div className="mini-empty action-empty">
              <b>No notifications yet</b>

              <p>
                New event announcements will appear here.
              </p>
            </div>
          )}

        </section>

      </div>

      <div className="student-quick-actions">

        <Link to="/student/teams">
          <b>Team Center</b>
          <span>Create, join and manage teams</span>
        </Link>

        <Link to="/student/results">
          <b>Results</b>
          <span>See official published results</span>
        </Link>

        <Link to="/student/certificates">
          <b>Certificates</b>
          <span>Access issued certificates</span>
        </Link>

        <Link to="/student/activity">
          <b>Activity Portfolio</b>
          <span>Build your verified record</span>
        </Link>

      </div>

    </section>
  )
}