import { useEffect, useMemo, useState } from 'react'
import { API, useAuth } from '../auth/AuthContext'

type EventRow = {
  id:number
  name:string
  event_code?:string
  event_date?:string
  organizing_department?:string
}

type AttendanceRow = {
  id:number
  event_id:number
  student_id:string
  team_id?:number | null
  student_name?:string | null
  roll_no?:string | null
  department?:string | null
  year?:string | number | null
  semester?:string | number | null
  team_name?:string | null
  team_code?:string | null
  check_in_at:string
  method:string
  status:'Present'|'Absent'|'Excused'|'Corrected'
  verified_by?:number | null
  verified_by_name?:string | null
}

type Summary = {
  total:number
  present:number
  absent:number
  excused:number
  corrected:number
}

const emptySummary:Summary = {
  total:0,
  present:0,
  absent:0,
  excused:0,
  corrected:0
}

function formatDateTime(value?:string | null) {
  if (!value) return '—'
  const date = new Date(value.includes('T') ? value : value.replace(' ','T'))
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-IN',{
    day:'2-digit',
    month:'2-digit',
    year:'numeric',
    hour:'2-digit',
    minute:'2-digit'
  })
}

function csvCell(value:unknown) {
  const text = String(value ?? '')
  return `"${text.replace(/"/g,'""')}"`
}

export default function CoordinatorAttendanceReportPage({ initialEventId = '' }: { initialEventId?: string } = {}) {
  const { token, user } = useAuth()

  const [events,setEvents] = useState<EventRow[]>([])
  const [eventId,setEventId] = useState(initialEventId)
  const [rows,setRows] = useState<AttendanceRow[]>([])
  const [summary,setSummary] = useState<Summary>(emptySummary)

  const [status,setStatus] = useState('All')
  const [method,setMethod] = useState('All')
  const [search,setSearch] = useState('')

  const [loading,setLoading] = useState(false)
  const [error,setError] = useState('')
  const [message,setMessage] = useState('')

  const [editing,setEditing] = useState<AttendanceRow | null>(null)
  const [editStatus,setEditStatus] = useState('Present')
  const [reason,setReason] = useState('')
  const [saving,setSaving] = useState(false)

  const headers = {
    Authorization:`Bearer ${token}`
  }

  async function loadEvents() {
    try {
      const response = await fetch(`${API}/api/events/manage`,{headers})
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Could not load events.')
      }

      const list = Array.isArray(data.rows)
        ? data.rows
        : Array.isArray(data.events)
          ? data.events
          : []

      setEvents(list)

      if (!eventId && list.length) {
        setEventId(String(list[0].id))
      }
    } catch (err:any) {
      setError(err.message || 'Could not load events.')
    }
  }

  async function loadAttendance(selected = eventId) {
    if (!selected) {
      setRows([])
      setSummary(emptySummary)
      return
    }

    setLoading(true)
    setError('')
    setMessage('')

    try {
      const response = await fetch(
        `${API}/api/coordinator/reports/attendance?event_id=${encodeURIComponent(selected)}`,
        {headers}
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Could not load attendance.')
      }

      setRows(Array.isArray(data.rows) ? data.rows : [])
      setSummary(data.summary || emptySummary)

    } catch (err:any) {
      setRows([])
      setSummary(emptySummary)
      setError(err.message || 'Could not load attendance.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(()=>{
    loadEvents()
  },[])

  useEffect(()=>{
    if (eventId) loadAttendance(eventId)
  },[eventId])

  const methods = useMemo(()=>{
    return Array.from(
      new Set(rows.map(row=>row.method).filter(Boolean))
    ).sort()
  },[rows])

  const filtered = useMemo(()=>{
    const q = search.trim().toLowerCase()

    return rows.filter(row=>{
      if (status !== 'All' && row.status !== status) return false
      if (method !== 'All' && row.method !== method) return false

      if (q) {
        const haystack = [
          row.student_name,
          row.student_id,
          row.roll_no,
          row.department,
          row.team_name,
          row.team_code,
          row.verified_by_name
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()

        if (!haystack.includes(q)) return false
      }

      return true
    })
  },[rows,status,method,search])

  const selectedEvent = events.find(
    event=>String(event.id)===eventId
  )

  function exportCsv() {
    if (!filtered.length) return

    const lines = [
      [
        'Student Name',
        'Student ID',
        'Roll No',
        'Department',
        'Year',
        'Semester',
        'Team',
        'Status',
        'Method',
        'Check-in Time',
        'Verified By'
      ].map(csvCell).join(',')
    ]

    filtered.forEach(row=>{
      lines.push([
        row.student_name || '',
        row.student_id,
        row.roll_no || '',
        row.department || '',
        row.year || '',
        row.semester || '',
        row.team_name || '',
        row.status,
        row.method,
        formatDateTime(row.check_in_at),
        row.verified_by_name || ''
      ].map(csvCell).join(','))
    })

    const blob = new Blob(
      ['\uFEFF' + lines.join('\r\n')],
      {type:'text/csv;charset=utf-8'}
    )

    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download =
      `attendance-${selectedEvent?.event_code || eventId}.csv`

    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  function printReport() {
    window.print()
  }

  function openCorrection(row:AttendanceRow) {
    setEditing(row)
    setEditStatus(row.status)
    setReason('')
    setError('')
    setMessage('')
  }

  async function saveCorrection() {
    if (!editing) return

    if (!reason.trim()) {
      setError('Correction reason is required.')
      return
    }

    setSaving(true)
    setError('')
    setMessage('')

    try {
      const response = await fetch(
        `${API}/api/coordinator/reports/attendance`,
        {
          method:'PATCH',
          headers:{
            ...headers,
            'Content-Type':'application/json'
          },
          body:JSON.stringify({
            attendance_id:editing.id,
            status:editStatus,
            reason:reason.trim()
          })
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Could not update attendance.')
      }

      setEditing(null)
      setReason('')
      setMessage(data.message || 'Attendance record updated.')
      await loadAttendance()

    } catch (err:any) {
      setError(err.message || 'Could not update attendance.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="portal-content attendance-report-page">

      <div className="attendance-report-header">
        <div>
          <span className="eyebrow">Coordinator Reports</span>
          <h1>Attendance Report</h1>
          <p>
            Review event check-ins, verification details and authorized
            attendance corrections.
          </p>
        </div>

        <div className="attendance-report-actions no-print">
          <button
            className="button button-light"
            onClick={()=>loadAttendance()}
            disabled={!eventId || loading}
          >
            Refresh
          </button>

          <button
            className="button button-light"
            onClick={exportCsv}
            disabled={!filtered.length}
          >
            Export CSV
          </button>

          <button
            className="button button-primary"
            onClick={printReport}
            disabled={!rows.length}
          >
            Print / PDF
          </button>
        </div>
      </div>

      <div className="attendance-event-bar no-print">
        <label>
          <span>Event</span>
          <select
            value={eventId}
            onChange={e=>setEventId(e.target.value)}
          >
            {!events.length && <option value="">No events available</option>}
            {events.map(event=>(
              <option key={event.id} value={event.id}>
                {event.name}
                {event.event_code ? ` — ${event.event_code}` : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      {selectedEvent && (
        <div className="attendance-print-title">
          <strong>{selectedEvent.name}</strong>
          <span>
            {selectedEvent.event_code || 'Event'} ·{' '}
            {selectedEvent.organizing_department || 'Department'}
          </span>
        </div>
      )}

      {error && (
        <div className="attendance-alert attendance-alert-error">
          {error}
        </div>
      )}

      {message && (
        <div className="attendance-alert attendance-alert-success">
          {message}
        </div>
      )}

      <div className="attendance-summary-grid">
        <article>
          <span>Total Records</span>
          <strong>{summary.total}</strong>
        </article>

        <article>
          <span>Present</span>
          <strong>{summary.present}</strong>
        </article>

        <article>
          <span>Absent</span>
          <strong>{summary.absent}</strong>
        </article>

        <article>
          <span>Excused</span>
          <strong>{summary.excused}</strong>
        </article>

        <article>
          <span>Corrected</span>
          <strong>{summary.corrected}</strong>
        </article>
      </div>

      <div className="attendance-filter-bar no-print">
        <input
          value={search}
          onChange={e=>setSearch(e.target.value)}
          placeholder="Search student, ID, roll no, team..."
        />

        <select
          value={status}
          onChange={e=>setStatus(e.target.value)}
        >
          <option>All</option>
          <option>Present</option>
          <option>Absent</option>
          <option>Excused</option>
          <option>Corrected</option>
        </select>

        <select
          value={method}
          onChange={e=>setMethod(e.target.value)}
        >
          <option>All</option>
          {methods.map(item=>(
            <option key={item}>{item}</option>
          ))}
        </select>

        <span className="attendance-filter-count">
          {filtered.length} record{filtered.length===1 ? '' : 's'}
        </span>
      </div>

      <div className="attendance-table-card">
        {loading ? (
          <div className="attendance-zero">
            Loading attendance records...
          </div>
        ) : !eventId ? (
          <div className="attendance-zero">
            Select an event to view attendance.
          </div>
        ) : !rows.length ? (
          <div className="attendance-zero">
            <strong>No attendance records found for this event.</strong>
            <span>
              Attendance will appear here after students are checked in.
            </span>
          </div>
        ) : !filtered.length ? (
          <div className="attendance-zero">
            No attendance records match the selected filters.
          </div>
        ) : (
          <div className="attendance-table-wrap">
            <table className="attendance-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Department</th>
                  <th>Team</th>
                  <th>Status</th>
                  <th>Method</th>
                  <th>Check-in</th>
                  <th>Verified By</th>
                  <th className="no-print">Action</th>
                </tr>
              </thead>

              <tbody>
                {filtered.map(row=>(
                  <tr key={row.id}>
                    <td>
                      <strong>{row.student_name || row.student_id}</strong>
                      <span>{row.student_id}</span>
                      {row.roll_no && <small>{row.roll_no}</small>}
                    </td>

                    <td>
                      <strong>{row.department || '—'}</strong>
                      <span>
                        {row.year ? `Year ${row.year}` : ''}
                        {row.year && row.semester ? ' · ' : ''}
                        {row.semester ? `Sem ${row.semester}` : ''}
                      </span>
                    </td>

                    <td>
                      {row.team_name ? (
                        <>
                          <strong>{row.team_name}</strong>
                          <span>{row.team_code || ''}</span>
                        </>
                      ) : 'Individual'}
                    </td>

                    <td>
                      <span
                        className={`attendance-status attendance-status-${row.status.toLowerCase()}`}
                      >
                        {row.status}
                      </span>
                    </td>

                    <td>{row.method || '—'}</td>

                    <td>{formatDateTime(row.check_in_at)}</td>

                    <td>{row.verified_by_name || '—'}</td>

                    <td className="no-print">
                      {user?.role !== 'HOD' && <button
                        className="attendance-correct-button"
                        onClick={()=>openCorrection(row)}
                      >
                        Correct
                      </button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <div className="attendance-modal-backdrop no-print">
          <div className="attendance-modal">
            <div className="attendance-modal-head">
              <div>
                <span>Attendance Correction</span>
                <h3>{editing.student_name || editing.student_id}</h3>
                <p>{editing.student_id}</p>
              </div>

              <button
                type="button"
                onClick={()=>setEditing(null)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <label>
              <span>Status</span>
              <select
                value={editStatus}
                onChange={e=>setEditStatus(e.target.value)}
              >
                <option>Present</option>
                <option>Absent</option>
                <option>Excused</option>
                <option>Corrected</option>
              </select>
            </label>

            <label>
              <span>Correction reason *</span>
              <textarea
                value={reason}
                onChange={e=>setReason(e.target.value)}
                placeholder="Explain why this attendance record is being corrected."
                rows={4}
              />
            </label>

            <p className="attendance-modal-note">
              This change will be recorded in the system audit log.
            </p>

            <div className="attendance-modal-actions">
              <button
                className="button button-light"
                onClick={()=>setEditing(null)}
                disabled={saving}
              >
                Cancel
              </button>

              <button
                className="button button-primary"
                onClick={saveCorrection}
                disabled={saving || !reason.trim()}
              >
                {saving ? 'Saving...' : 'Save Correction'}
              </button>
            </div>
          </div>
        </div>
      )}

    </section>
  )
}
