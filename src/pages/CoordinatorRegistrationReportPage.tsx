import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthContext'

import { API } from '../lib/api'

type EventRow = {
  id:number
  name:string
  event_code:string
  status:string
  capacity?:number | null
}

type SummaryRow = {
  status:string
  count:number
}

type PaymentRow = {
  amount?:number
  method?:string
  status?:string
}

type RegistrationRow = {
  id:number
  registration_type:'Individual'|'Team'
  status:string
  source?:string
  created_at?:string
  waiting_position?:number | null
  subject?:any
  payment?:PaymentRow | null
}

const statuses = [
  '',
  'Confirmed',
  'Payment Pending',
  'Waiting for Approval',
  'Waiting List',
  'Rejected',
  'Cancelled'
]

export default function CoordinatorRegistrationReportPage(){
  const {token} = useAuth()

  const [events,setEvents] = useState<EventRow[]>([])
  const [eventId,setEventId] = useState('')
  const [rows,setRows] = useState<RegistrationRow[]>([])
  const [summary,setSummary] = useState<SummaryRow[]>([])
  const [status,setStatus] = useState('')
  const [query,setQuery] = useState('')
  const [search,setSearch] = useState('')
  const [seatsUsed,setSeatsUsed] = useState(0)
  const [capacity,setCapacity] = useState<number|null>(null)
  const [loading,setLoading] = useState(false)
  const [error,setError] = useState('')
  const [refreshKey,setRefreshKey] = useState(0)

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

        const eventRows:EventRow[] =
          data.rows || data.events || []

        setEvents(eventRows)

        if(eventRows[0]){
          setEventId(currentEventId=>{
            if(
              currentEventId &&
              eventRows.some(event=>String(event.id) === currentEventId)
            ){
              return currentEventId
            }

            return String(eventRows[0].id)
          })
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
    async function loadReport(){
      if(!eventId){
        setRows([])
        setSummary([])
        return
      }

      setLoading(true)
      setError('')

      try{
        const params = new URLSearchParams({
          event_id:eventId
        })

        if(status){
          params.set('status',status)
        }

        if(search.trim()){
          params.set('q',search.trim())
        }

        const response = await fetch(
          `${API}/api/registrations/manage?${params.toString()}`,
          {
            headers:{
              Authorization:`Bearer ${token}`
            }
          }
        )

        const data = await response.json()

        if(!response.ok){
          throw new Error(
            data.error ||
            'Unable to load registration report.'
          )
        }

        setRows(data.rows || [])
        setSummary(data.summary || [])
        setSeatsUsed(Number(data.seats_used || 0))
        setCapacity(
          data.capacity == null
            ? null
            : Number(data.capacity)
        )
      }catch(err:any){
        setRows([])
        setSummary([])
        setError(
          err.message ||
          'Unable to load registration report.'
        )
      }finally{
        setLoading(false)
      }
    }

    if(token) loadReport()
  },[eventId,status,search,token,refreshKey])

  const selectedEvent = events.find(
    event=>String(event.id) === eventId
  )

  function summaryCount(target:string){
    return Number(
      summary.find(item=>item.status === target)?.count || 0
    )
  }

  const totalActive = useMemo(
    ()=>summary.reduce(
      (total,item)=>total + Number(item.count || 0),
      0
    ),
    [summary]
  )

  function participantName(row:RegistrationRow){
    if(row.registration_type === 'Individual'){
      return (
        row.subject?.name ||
        row.subject?.student_id ||
        'Student'
      )
    }

    return (
      row.subject?.team_name ||
      row.subject?.team_code ||
      'Team'
    )
  }

  function participantId(row:RegistrationRow){
    if(row.registration_type === 'Individual'){
      return row.subject?.student_id || '-'
    }

    return row.subject?.team_code || '-'
  }

  function formatDate(value?:string){
    if(!value) return '-'

    const date = new Date(value)

    if(Number.isNaN(date.getTime())){
      return value
    }

    return date.toLocaleString('en-IN',{
      day:'2-digit',
      month:'2-digit',
      year:'numeric',
      hour:'2-digit',
      minute:'2-digit'
    })
  }

  function submitSearch(event:React.FormEvent){
    event.preventDefault()
    setSearch(query)
  }

  function handleStatusChange(value:string){
    setStatus(value)
  }

  function clearFilters(){
    setQuery('')
    setSearch('')
    setStatus('')
  }
  function refreshReport(){
    setRefreshKey(value=>value + 1)
  }

  function csvEscape(value:any){
    const text =
      value == null
        ? ''
        : String(value)

    return `"${text.replace(/"/g,'""')}"`
  }

  function exportCSV(){
    if(!rows.length){
      window.alert(
        'There are no registration records to export.'
      )
      return
    }

    const headers = [
      'Registration ID',
      'Event Code',
      'Event Name',
      'Participant',
      'Student ID / Team Code',
      'Type',
      'Status',
      'Source',
      'Payment Amount',
      'Payment Status',
      'Payment Method',
      'Waiting Position',
      'Registered At'
    ]

    const csvRows = rows.map(row=>[
      row.id,
      selectedEvent?.event_code || '',
      selectedEvent?.name || '',
      participantName(row),
      participantId(row),
      row.registration_type,
      row.status,
      row.source || '',
      row.payment?.amount ?? '',
      row.payment?.status || '',
      row.payment?.method || '',
      row.waiting_position || '',
      formatDate(row.created_at)
    ])

    const csv = [
      headers.map(csvEscape).join(','),
      ...csvRows.map(values=>
        values.map(csvEscape).join(',')
      )
    ].join('\r\n')

    const blob = new Blob(
      ['\uFEFF' + csv],
      {type:'text/csv;charset=utf-8;'}
    )

    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')

    const safeEvent =
      (
        selectedEvent?.event_code ||
        selectedEvent?.name ||
        'event'
      ).replace(/[^a-z0-9-_]+/gi,'-')

    anchor.href = url
    anchor.download =
      `registration-report-${safeEvent}.csv`

    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()

    URL.revokeObjectURL(url)
  }

  function printReport(){
    window.print()
  }

  return (
    <div className="page-stack coordinator-registration-report-page">

      <section className="page-hero compact">
        <div>
          <span className="eyebrow">
            Coordinator Reports
          </span>

          <h2>Registration Report</h2>

          <p>
            View confirmed, pending, approval and
            waiting-list registrations for events you manage.
          </p>
        </div>
        <div className="registration-report-toolbar">

          <button
            type="button"
            className="button"
            onClick={refreshReport}
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>

          <button
            type="button"
            className="button"
            onClick={exportCSV}
            disabled={!rows.length}
          >
            Export CSV
          </button>

          <button
            type="button"
            className="button button-primary"
            onClick={printReport}
            disabled={!eventId}
          >
            Print / PDF
          </button>

        </div>
      </section>

      <section className="panel registration-report-filter-panel">

        <div className="communication-section-heading">
          <div>
            <span className="eyebrow">
              Report Filters
            </span>

            <h3>Select Event</h3>

            <p>
              Registration data is limited to events
              you are permitted to coordinate.
            </p>
          </div>
        </div>

        <div className="registration-report-filter-grid">

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
                  key={event.id}
                  value={event.id}
                >
                  {event.name} - {event.event_code} - {event.status}
                </option>
              ))}
            </select>
          </label>

          <label className="communication-field">
            <span>Status</span>

            <select
              value={status}
              onChange={e=>handleStatusChange(e.currentTarget.value)}
            >
              {statuses.map(item=>(
                <option
                  key={item || 'all'}
                  value={item}
                >
                  {item || 'All Statuses'}
                </option>
              ))}
            </select>
          </label>

        </div>

        <form
          className="registration-report-search"
          onSubmit={submitSearch}
        >
          <label className="communication-field">
            <span>Search Student / Team</span>

            <input
              value={query}
              onChange={e=>setQuery(e.target.value)}
              placeholder="Student name, Student ID, team name or team code"
            />
          </label>

          <div className="registration-report-search-actions">
            <button
              type="submit"
              className="button button-primary"
            >
              Search
            </button>

            <button
              type="button"
              className="button"
              onClick={clearFilters}
            >
              Clear
            </button>
          </div>
        </form>

      </section>

      {selectedEvent && (
        <section className="registration-report-summary-grid">

          <article className="panel registration-report-stat">
            <span>Total Active</span>
            <strong>{totalActive}</strong>
            <small>Registrations</small>
          </article>

          <article className="panel registration-report-stat">
            <span>Confirmed</span>
            <strong>{summaryCount('Confirmed')}</strong>
            <small>Ready participants</small>
          </article>

          <article className="panel registration-report-stat">
            <span>Payment Pending</span>
            <strong>{summaryCount('Payment Pending')}</strong>
            <small>Awaiting payment</small>
          </article>

          <article className="panel registration-report-stat">
            <span>Approval Pending</span>
            <strong>{summaryCount('Waiting for Approval')}</strong>
            <small>Needs approval</small>
          </article>

          <article className="panel registration-report-stat">
            <span>Waiting List</span>
            <strong>{summaryCount('Waiting List')}</strong>
            <small>Waiting for seat</small>
          </article>

          <article className="panel registration-report-stat">
            <span>Seats Used</span>
            <strong>
              {seatsUsed}
              {capacity != null ? ` / ${capacity}` : ''}
            </strong>
            <small>
              {capacity != null
                ? 'Event capacity'
                : 'No fixed capacity'}
            </small>
          </article>

        </section>
      )}

      <section className="panel registration-report-results-panel">

        <div className="communication-section-heading">
          <div>
            <span className="eyebrow">
              Registration Records
            </span>

            <h3>
              {selectedEvent
                ? selectedEvent.name
                : 'Select an Event'}
            </h3>

            <p>
              {status
                ? `Showing ${status} registrations.`
                : 'Showing all registration statuses.'}
            </p>
          </div>

          <div className="communication-recipient-count">
            <strong>{rows.length}</strong>
            <span>Records</span>
          </div>
        </div>

        {loading && (
          <p className="muted">
            Loading registration report...
          </p>
        )}

        {!loading &&
          eventId &&
          rows.length === 0 && (
            <div className="communication-empty-state">
              <strong>
                No registration records found.
              </strong>

              <span>
                No registrations match the selected
                event, status and search filters.
              </span>
            </div>
          )}

        {!loading && rows.length > 0 && (
          <div className="registration-report-table-wrap">

            <table className="registration-report-table">
              <thead>
                <tr>
                  <th>Participant</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Source</th>
                  <th>Payment</th>
                  <th>Waiting</th>
                  <th>Registered</th>
                </tr>
              </thead>

              <tbody>
                {rows.map(row=>(
                  <tr key={row.id}>

                    <td>
                      <strong>
                        {participantName(row)}
                      </strong>

                      <small>
                        {participantId(row)}
                      </small>
                    </td>

                    <td>
                      {row.registration_type}
                    </td>

                    <td>
                      <span
                        className="registration-report-status"
                        data-status={row.status}
                      >
                        {row.status}
                      </span>
                    </td>

                    <td>
                      {row.source || '-'}
                    </td>

                    <td>
                      {row.payment ? (
                        <>
                          <strong>
                            Rs. {Number(
                              row.payment.amount || 0
                            ).toLocaleString('en-IN')}
                          </strong>

                          <small>
                            {row.payment.status || '-'}
                            {row.payment.method
                              ? ` - ${row.payment.method}`
                              : ''}
                          </small>
                        </>
                      ) : (
                        <span className="muted">
                          Not required
                        </span>
                      )}
                    </td>

                    <td>
                      {row.waiting_position
                        ? `#${row.waiting_position}`
                        : '-'}
                    </td>

                    <td>
                      {formatDate(row.created_at)}
                    </td>

                  </tr>
                ))}
              </tbody>
            </table>

          </div>
        )}

      </section>
    </div>
  )
}
