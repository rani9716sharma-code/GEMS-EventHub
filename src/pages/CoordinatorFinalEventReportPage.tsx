import {useCallback,useEffect,useMemo,useState} from 'react'
import { useAuth } from '../auth/AuthContext'

import { API } from '../lib/api'

type EventRow = {
  id:number
  name:string
  event_code?:string
  status?:string
  category?:string
  organizing_department?:string
  event_date?:string
  start_time?:string
  end_time?:string
  venue?:string
  registration_type?:string
  participation_type?:string
  registration_mode?:string
  capacity?:number
  fee_type?:string
  fee_amount?:number
  creator_name?:string
  main_coordinator_name?:string
}

type FinalReport = {
  event:EventRow
  registrations:{
    total:number
    active:number
    confirmed:number
    approval_pending:number
    payment_pending:number
    waiting_list:number
    cancelled:number
    rejected:number
  }
  payments:{
    records:number
    paid_count:number
    pending_count:number
    failed_count:number
    refunded_count:number
    voided_count:number
    collected_amount:number
    cash_amount:number
    upi_amount:number
    online_amount:number
  }
  attendance:{
    total_records:number
    present:number
    absent:number
    excused:number
    corrected:number
  }
  attendance_rows:any[]
  results:any[]
  certificates:any[]
  feedback:{
    responses:number
    average_rating:number|null
  }
  generated_at:string
}

function money(value:any){
  return `Rs. ${Number(value || 0).toLocaleString('en-IN',{
    maximumFractionDigits:2
  })}`
}

function dateText(value?:string){
  if(!value) return '—'
  const raw = String(value)
  const date = new Date(raw.includes('T') ? raw : `${raw}T00:00:00`)
  if(Number.isNaN(date.getTime())) return raw
  return date.toLocaleDateString('en-IN',{
    day:'2-digit',
    month:'short',
    year:'numeric'
  })
}

function dateTime(value?:string){
  if(!value) return '—'
  const date = new Date(value)
  if(Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-IN',{
    day:'2-digit',
    month:'short',
    year:'numeric',
    hour:'2-digit',
    minute:'2-digit'
  })
}

function participant(row:any){
  return (
    row.student_name ||
    row.team_name ||
    row.student_id ||
    (row.team_id ? `Team #${row.team_id}` : '—')
  )
}

export default function CoordinatorFinalEventReportPage({ initialEventId = '' }: { initialEventId?: string } = {}){
  const {token}=useAuth()

  const [events,setEvents]=useState<EventRow[]>([])
  const [eventId,setEventId]=useState(initialEventId)
  const [report,setReport]=useState<FinalReport|null>(null)
  const [loadingEvents,setLoadingEvents]=useState(true)
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')

  const headers=useMemo(
    ()=>({
      Authorization:`Bearer ${token}`
    }),
    [token]
  )

  const loadEvents=useCallback(async()=>{
    if(!token) return

    setLoadingEvents(true)
    setError('')

    try{
      const response=await fetch(`${API}/api/events/manage`,{
        headers
      })

      const data=await response.json()

      if(!response.ok){
        throw new Error(data.error || 'Unable to load events.')
      }

      const rows=(data.rows || []) as EventRow[]
      setEvents(rows)

      setEventId(current=>{
        if(current && rows.some(row=>String(row.id)===current)){
          return current
        }
        return rows.length ? String(rows[0].id) : ''
      })
    }
    catch(err:any){
      setEvents([])
      setEventId('')
      setError(err?.message || 'Unable to load events.')
    }
    finally{
      setLoadingEvents(false)
    }
  },[token,headers])

  const loadReport=useCallback(async()=>{
    if(!token || !eventId){
      setReport(null)
      return
    }

    setLoading(true)
    setError('')

    try{
      const response=await fetch(
        `${API}/api/coordinator/reports/final?event_id=${encodeURIComponent(eventId)}`,
        {headers}
      )

      const data=await response.json()

      if(!response.ok){
        throw new Error(data.error || 'Unable to load final event report.')
      }

      setReport(data)
    }
    catch(err:any){
      setReport(null)
      setError(err?.message || 'Unable to load final event report.')
    }
    finally{
      setLoading(false)
    }
  },[token,eventId,headers])

  useEffect(()=>{
    loadEvents()
  },[loadEvents])

  useEffect(()=>{
    loadReport()
  },[loadReport])

  const refresh=async()=>{
    await loadEvents()
    await loadReport()
  }

  const printReport=()=>{
    window.print()
  }

  return (
    <div className="page-stack final-event-report-page">
      <section className="final-report-header">
        <div>
          <span className="eyebrow">Coordinator Reports</span>
          <h2>Final Event Report</h2>
          <p>
            Complete event record for review, printing and the
            college archive.
          </p>
        </div>

        <div className="final-report-header-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={refresh}
            disabled={loading || loadingEvents}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>

          <button
            type="button"
            className="button button-primary"
            onClick={printReport}
            disabled={!report}
          >
            Print / Save PDF
          </button>
        </div>
      </section>

      <section className="panel final-report-filter">
        <label>
          <span>Event</span>
          <select
            value={eventId}
            onChange={event=>setEventId(event.target.value)}
            disabled={loadingEvents}
          >
            {!events.length && (
              <option value="">
                {loadingEvents ? 'Loading events...' : 'No events available'}
              </option>
            )}

            {events.map(event=>(
              <option key={event.id} value={event.id}>
                {event.name}
                {event.event_code ? ` (${event.event_code})` : ''}
              </option>
            ))}
          </select>
        </label>
      </section>

      {error && (
        <div className="final-report-error">
          {error}
        </div>
      )}

      {!loadingEvents && !events.length && !error && (
        <section className="panel final-report-empty">
          <h3>No events available</h3>
          <p>
            No event is currently available within your coordinator
            permissions.
          </p>
        </section>
      )}

      {loading && (
        <section className="panel final-report-empty">
          <h3>Preparing report...</h3>
          <p>Loading the complete event record.</p>
        </section>
      )}

      {!loading && report && (
        <div className="final-report-document">
          <section className="final-report-title-block">
            <div>
              <span>GEMS POLYTECHNIC COLLEGE</span>
              <h1>Final Event Report</h1>
              <p>GEMS EventHub — Official Event Record</p>
            </div>

            <div className="final-report-status-block">
              <small>EVENT STATUS</small>
              <strong>{report.event.status || '—'}</strong>
            </div>
          </section>

          <section className="final-report-event-card">
            <div className="final-report-event-heading">
              <div>
                <small>EVENT</small>
                <h2>{report.event.name}</h2>
                <p>
                  {report.event.event_code || 'No event code'}
                </p>
              </div>

              <div className="final-report-generated">
                <small>Report generated</small>
                <strong>{dateTime(report.generated_at)}</strong>
              </div>
            </div>

            <div className="final-report-details-grid">
              <div>
                <small>Department</small>
                <strong>
                  {report.event.organizing_department || '—'}
                </strong>
              </div>

              <div>
                <small>Category</small>
                <strong>{report.event.category || '—'}</strong>
              </div>

              <div>
                <small>Date</small>
                <strong>{dateText(report.event.event_date)}</strong>
              </div>

              <div>
                <small>Time</small>
                <strong>
                  {report.event.start_time || '—'}
                  {report.event.end_time
                    ? ` – ${report.event.end_time}`
                    : ''}
                </strong>
              </div>

              <div>
                <small>Venue</small>
                <strong>{report.event.venue || '—'}</strong>
              </div>

              <div>
                <small>Registration Type</small>
                <strong>
                  {report.event.participation_type || report.event.registration_mode || report.event.registration_type || '-'}
                </strong>
              </div>

              <div>
                <small>Capacity</small>
                <strong>
                  {report.event.capacity ?? '—'}
                </strong>
              </div>

              <div>
                <small>Main Coordinator</small>
                <strong>
                  {report.event.main_coordinator_name || '—'}
                </strong>
              </div>
            </div>
          </section>

          <section className="final-report-section">
            <div className="final-report-section-head">
              <div>
                <span>01</span>
                <div>
                  <h3>Registration Summary</h3>
                  <p>Participation and registration status.</p>
                </div>
              </div>
            </div>

            <div className="final-report-metrics">
              <article>
                <small>Active</small>
                <strong>{report.registrations.active}</strong>
              </article>

              <article>
                <small>Confirmed</small>
                <strong>{report.registrations.confirmed}</strong>
              </article>

              <article>
                <small>Approval Pending</small>
                <strong>
                  {report.registrations.approval_pending}
                </strong>
              </article>

              <article>
                <small>Payment Pending</small>
                <strong>
                  {report.registrations.payment_pending}
                </strong>
              </article>

              <article>
                <small>Waiting List</small>
                <strong>{report.registrations.waiting_list}</strong>
              </article>
            </div>
          </section>

          <section className="final-report-section">
            <div className="final-report-section-head">
              <div>
                <span>02</span>
                <div>
                  <h3>Payment Reconciliation</h3>
                  <p>Current verified collection summary.</p>
                </div>
              </div>

              <strong className="final-report-total">
                {money(report.payments.collected_amount)}
              </strong>
            </div>

            <div className="final-report-metrics">
              <article>
                <small>Paid</small>
                <strong>{report.payments.paid_count}</strong>
              </article>

              <article>
                <small>Pending</small>
                <strong>{report.payments.pending_count}</strong>
              </article>

              <article>
                <small>Cash</small>
                <strong>{money(report.payments.cash_amount)}</strong>
              </article>

              <article>
                <small>Coordinator UPI</small>
                <strong>{money(report.payments.upi_amount)}</strong>
              </article>

              <article>
                <small>Online</small>
                <strong>{money(report.payments.online_amount)}</strong>
              </article>
            </div>

            {(report.payments.failed_count>0 ||
              report.payments.refunded_count>0 ||
              report.payments.voided_count>0) && (
              <div className="final-report-note">
                Exceptions — Failed: {report.payments.failed_count},
                Refunded: {report.payments.refunded_count},
                Voided: {report.payments.voided_count}
              </div>
            )}
          </section>

          <section className="final-report-section">
            <div className="final-report-section-head">
              <div>
                <span>03</span>
                <div>
                  <h3>Attendance Summary</h3>
                  <p>Recorded event-day attendance.</p>
                </div>
              </div>
            </div>

            <div className="final-report-metrics">
              <article>
                <small>Records</small>
                <strong>
                  {report.attendance.total_records}
                </strong>
              </article>

              <article>
                <small>Present</small>
                <strong>{report.attendance.present}</strong>
              </article>

              <article>
                <small>Absent</small>
                <strong>{report.attendance.absent}</strong>
              </article>

              <article>
                <small>Excused</small>
                <strong>{report.attendance.excused}</strong>
              </article>

              <article>
                <small>Corrected</small>
                <strong>{report.attendance.corrected}</strong>
              </article>
            </div>

            {report.attendance_rows.length ? (
              <div className="final-report-table-wrap">
                <table className="final-report-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Department</th>
                      <th>Team</th>
                      <th>Status</th>
                      <th>Method</th>
                      <th>Check-in</th>
                    </tr>
                  </thead>

                  <tbody>
                    {report.attendance_rows.map(row=>(
                      <tr key={row.id}>
                        <td>
                          <strong>
                            {row.student_name || row.student_id}
                          </strong>
                          <small>{row.student_id}</small>
                        </td>

                        <td>{row.student_department || '—'}</td>
                        <td>{row.team_name || '—'}</td>
                        <td>{row.status}</td>
                        <td>{row.method || '—'}</td>
                        <td>{dateTime(row.check_in_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="final-report-section-empty">
                No attendance records found for this event.
              </div>
            )}
          </section>

          <section className="final-report-section">
            <div className="final-report-section-head">
              <div>
                <span>04</span>
                <div>
                  <h3>Published Results</h3>
                  <p>Official verified outcomes.</p>
                </div>
              </div>

              <strong className="final-report-count">
                {report.results.length}
              </strong>
            </div>

            {report.results.length ? (
              <div className="final-report-table-wrap">
                <table className="final-report-table">
                  <thead>
                    <tr>
                      <th>Position</th>
                      <th>Winner / Team</th>
                      <th>Award</th>
                      <th>Category</th>
                      <th>Points</th>
                    </tr>
                  </thead>

                  <tbody>
                    {report.results.map(row=>(
                      <tr key={row.id}>
                        <td>
                          {row.position
                            ? `#${row.position}`
                            : '—'}
                        </td>
                        <td>
                          <strong>{participant(row)}</strong>
                          {row.student_department && (
                            <small>{row.student_department}</small>
                          )}
                        </td>
                        <td>{row.award || '—'}</td>
                        <td>{row.category || '—'}</td>
                        <td>{Number(row.points_awarded || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="final-report-section-empty">
                No published results found for this event.
              </div>
            )}
          </section>

          <section className="final-report-section">
            <div className="final-report-section-head">
              <div>
                <span>05</span>
                <div>
                  <h3>Certificates Issued</h3>
                  <p>
                    Certificates recorded against this event.
                  </p>
                </div>
              </div>

              <strong className="final-report-count">
                {report.certificates.length}
              </strong>
            </div>

            {report.certificates.length ? (
              <div className="final-report-table-wrap">
                <table className="final-report-table">
                  <thead>
                    <tr>
                      <th>Certificate ID</th>
                      <th>Recipient</th>
                      <th>Type</th>
                      <th>Issued</th>
                      <th>Verification Token</th>
                    </tr>
                  </thead>

                  <tbody>
                    {report.certificates.map(row=>(
                      <tr key={row.id}>
                        <td>
                          <strong>{row.certificate_id}</strong>
                        </td>
                        <td>{participant(row)}</td>
                        <td>{row.type || '—'}</td>
                        <td>{dateTime(row.issued_at)}</td>
                        <td className="final-report-token">
                          {row.verification_token || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="final-report-section-empty">
                No certificates issued for this event.
              </div>
            )}
          </section>

          <section className="final-report-section">
            <div className="final-report-section-head">
              <div>
                <span>06</span>
                <div>
                  <h3>Feedback</h3>
                  <p>Submitted event feedback summary.</p>
                </div>
              </div>
            </div>

            <div className="final-report-feedback">
              <div>
                <small>Responses</small>
                <strong>{report.feedback.responses}</strong>
              </div>

              <div>
                <small>Average Rating</small>
                <strong>
                  {report.feedback.average_rating === null
                    ? 'No feedback'
                    : `${report.feedback.average_rating} / 5`}
                </strong>
              </div>
            </div>
          </section>

          <section className="final-report-signoff">
            <div>
              <span>Prepared through</span>
              <strong>GEMS EventHub</strong>
            </div>

            <div>
              <span>Event Coordinator</span>
              <strong>
                {report.event.main_coordinator_name || '________________'}
              </strong>
            </div>

            <div>
              <span>Authorized Signature</span>
              <strong>________________</strong>
            </div>
          </section>

          <footer className="final-report-footer">
            <span>
              GEMS Polytechnic College • Official Event Archive
            </span>
            <span>
              Generated {dateTime(report.generated_at)}
            </span>
          </footer>
        </div>
      )}
    </div>
  )
}



