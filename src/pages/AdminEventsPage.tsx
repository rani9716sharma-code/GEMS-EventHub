import { useEffect,useState } from 'react'
import { Link } from 'react-router-dom'
import { API,useAuth } from '../auth/AuthContext'

type E={
  id:number
  event_code:string
  name:string
  category:string
  organizing_department:string
  event_date:string
  venue:string
  status:string
  creator_name:string
}

type EventView='current'|'history'

export default function AdminEventsPage(){
  const{token}=useAuth()
  const[rows,setRows]=useState<E[]>([])
  const[loading,setLoading]=useState(true)
  const[busy,setBusy]=useState<number|null>(null)
  const[error,setError]=useState('')
  const[message,setMessage]=useState('')
  const[view,setView]=useState<EventView>('current')

  async function load(){
    setLoading(true)
    setError('')
    try{
      const r=await fetch(`${API}/api/events/manage`,{
        headers:{Authorization:`Bearer ${token}`}
      })
      const d=await r.json()
      if(!r.ok)throw new Error(d.error)
      setRows(d.rows||[])
    }catch(e){
      setError(e instanceof Error?e.message:'Could not load events.')
    }finally{
      setLoading(false)
    }
  }

  useEffect(()=>{load()},[token])

  async function approve(id:number){
    const confirmed=window.confirm(
      'Approve this submitted event?'
    )

    if(!confirmed)return

    setBusy(id)
    setError('')
    setMessage('')

    try{
      const r=await fetch(`${API}/api/events/${id}/approval`,{
        method:'POST',
        headers:{
          Authorization:`Bearer ${token}`,
          'Content-Type':'application/json'
        },
        body:JSON.stringify({
          action:'approve'
        })
      })

      const d=await r.json()

      if(!r.ok){
        throw new Error(d.error||'Could not approve event.')
      }

      setMessage('Event approved successfully.')
      await load()
    }catch(e){
      setError(
        e instanceof Error
          ? e.message
          : 'Could not approve event.'
      )
    }finally{
      setBusy(null)
    }
  }
  async function publish(id:number){
    setBusy(id)
    setError('')
    setMessage('')
    try{
      const r=await fetch(`${API}/api/events/${id}/publish`,{
        method:'POST',
        headers:{Authorization:`Bearer ${token}`}
      })
      const d=await r.json()
      if(!r.ok)throw new Error(d.error)
      setMessage('Event published successfully.')
      await load()
    }catch(e){
      setError(e instanceof Error?e.message:'Could not publish event.')
    }finally{
      setBusy(null)
    }
  }

  async function completeEvent(event:E){
    const confirmed=window.confirm(
      `Mark "${event.name}" as completed?

This will close registration and move the event to Event History.

Registrations, payments, attendance, results and certificates will be preserved.`
    )

    if(!confirmed)return

    setBusy(event.id)
    setError('')
    setMessage('')

    try{
      const r=await fetch(
        `${API}/api/events/${event.id}/complete`,
        {
          method:'POST',
          headers:{
            Authorization:`Bearer ${token}`
          }
        }
      )

      const d=await r.json()

      if(!r.ok){
        throw new Error(
          d.error || 'Could not mark event as completed.'
        )
      }

      setMessage(
        d.message || `${event.name} moved to Event History.`
      )

      await load()
    }catch(e){
      setError(
        e instanceof Error
          ? e.message
          : 'Could not mark event as completed.'
      )
    }finally{
      setBusy(null)
    }
  }


  async function removeEvent(event:E){
    const warning=`Delete "${event.name}"?

This permanently removes the event and its registrations, payments, attendance, results, certificates and related event data. This cannot be undone.`

    if(!window.confirm(warning))return

    const typed=window.prompt(
      `Type DELETE to permanently remove ${event.event_code}:`
    )

    if(typed!=='DELETE')return

    setBusy(event.id)
    setError('')
    setMessage('')

    try{
      const r=await fetch(`${API}/api/events/${event.id}`,{
        method:'DELETE',
        headers:{Authorization:`Bearer ${token}`}
      })

      const d=await r.json()

      if(!r.ok)throw new Error(d.error||'Could not delete event.')

      setMessage(`${event.name} deleted successfully.`)
      await load()
    }catch(e){
      setError(e instanceof Error?e.message:'Could not delete event.')
    }finally{
      setBusy(null)
    }
  }


  function isHistoryEvent(event:E){
    const status=(event.status||'').trim().toLowerCase()

    return (
      status==='completed' ||
      status==='cancelled' ||
      status==='archived' ||
      status==='expired'
    )
  }

  const historyRows=rows
    .filter(isHistoryEvent)
    .sort((a,b)=>b.event_date.localeCompare(a.event_date))

  const currentRows=rows
    .filter(event=>!isHistoryEvent(event))
    .sort((a,b)=>a.event_date.localeCompare(b.event_date))

  const visibleRows=view==='history'?historyRows:currentRows

  const completedCount=historyRows.filter(
    event=>event.status.toLowerCase()==='completed'
  ).length

  const cancelledCount=historyRows.filter(
    event=>event.status.toLowerCase()==='cancelled'
  ).length

  function EventActions({event}:{event:E}){
    return <div className="event-admin-actions admin-action-row">
      <Link
        className="button button-ghost button-small"
        to={`/admin/events/create?edit=${event.id}`}
      >
        Edit
      </Link><Link className="button button-ghost button-small" to={`/admin/events/${event.id}`}>Control Center</Link>

      <Link
        className="button button-ghost button-small"
        to={`/admin/registrations?event=${event.id}`}
      >
        Registrations
      </Link>

      {event.status==='Submitted'&&view==='current'&&
        <button
          type="button"
          className="button button-primary button-small"
          disabled={busy===event.id}
          onClick={()=>approve(event.id)}
        >
          {busy===event.id?'Working...':'Approve'}
        </button>
      }
      {event.status==='Approved'&&view==='current'&&
        <button
          className="button button-primary button-small"
          disabled={busy===event.id}
          onClick={()=>publish(event.id)}
        >
          {busy===event.id?'Working...':'Publish'}
        </button>
      }

      {view==='current'&&
       ['Published','Registration Open'].includes(event.status)&&
        <button
          type="button"
          className="button button-complete-soft button-small"
          disabled={busy===event.id}
          onClick={()=>completeEvent(event)}
        >
          {busy===event.id?'Working...':'Mark Completed'}
        </button>
      }

      <button
        className="button button-danger-soft button-small"
        disabled={busy===event.id}
        onClick={()=>removeEvent(event)}
      >
        Delete
      </button>
    </div>
  }

  return <section className="portal-content admin-events-page">

    <div className="page-toolbar">
      <div>
        <span className="eyebrow">Event management</span>
        <h2>{view==='current'?'All Events':'Event History'}</h2>
        <p>
          {view==='current'
            ?'Manage current and upcoming events, registrations and publication status.'
            :'Review past, completed and cancelled college events.'}
        </p>
      </div>

      <Link
        className="button button-primary"
        to="/admin/events/create"
      >
        + Create Event
      </Link>
    </div>

    {error&&
      <div className="form-alert error">
        {error}
      </div>
    }

    {message&&
      <div className="form-alert success">
        {message}
      </div>
    }

    <div className="event-history-toolbar">
      <div className="event-history-tabs">
        <button
          type="button"
          className={`event-history-tab ${view==='current'?'active':''}`}
          onClick={()=>setView('current')}
        >
          <span>Current Events</span>
          <strong>{currentRows.length}</strong>
        </button>

        <button
          type="button"
          className={`event-history-tab ${view==='history'?'active':''}`}
          onClick={()=>setView('history')}
        >
          <span>Event History</span>
          <strong>{historyRows.length}</strong>
        </button>
      </div>
    </div>

    {view==='history'&&
      <div className="event-history-summary">
        <div className="event-history-stat">
          <span>Total History</span>
          <strong>{historyRows.length}</strong>
          <small>Past and closed events</small>
        </div>

        <div className="event-history-stat">
          <span>Completed</span>
          <strong>{completedCount}</strong>
          <small>Marked completed</small>
        </div>

        <div className="event-history-stat">
          <span>Cancelled</span>
          <strong>{cancelledCount}</strong>
          <small>Cancelled events</small>
        </div>

        <div className="event-history-stat">
          <span>Past Events</span>
          <strong>
            {historyRows.length-completedCount-cancelledCount}
          </strong>
          <small>Automatically archived by date</small>
        </div>
      </div>
    }

    <div className="data-table-card modern-table-card">
      <div className="table-scroll">
        <table className="student-table modern-admin-table">
          <thead>
            <tr>
              <th>Event</th>
              <th>Department</th>
              <th>Date</th>
              <th>Venue</th>
              <th>Status</th>
              <th>Created By</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {loading?
              <tr>
                <td colSpan={7}>
                  <div className="table-state">
                    Loading events...
                  </div>
                </td>
              </tr>
            :visibleRows.length?
              visibleRows.map(event=>
                <tr key={event.id}>
                  <td>
                    <div className="table-primary">
                      <strong>{event.name}</strong>
                      <small>
                        {event.event_code} - {event.category}
                      </small>
                    </div>
                  </td>

                  <td>{event.organizing_department}</td>
                  <td>{event.event_date}</td>
                  <td>{event.venue}</td>

                  <td>
                    <span
                      className={`event-status status-${event.status
                        .toLowerCase()
                        .split(' ')
                        .join('-')}`}
                    >
                      {event.status}
                    </span>
                  </td>

                  <td>{event.creator_name}</td>

                  <td>
                    <EventActions event={event}/>
                  </td>
                </tr>
              )
            :
              <tr>
                <td colSpan={7}>
                  <div className="table-state">
                    {view==='history'
                      ?'No event history yet. Past and completed events will appear here automatically.'
                      :'No current or upcoming events.'}
                  </div>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>

  </section>
}