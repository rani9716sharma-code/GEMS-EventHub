import { FormEvent, useCallback, useEffect, useState } from 'react'
import { API, useAuth } from '../auth/AuthContext'

type ScannerEvent = {
  id: number
  event_code?: string
  name: string
  event_date?: string
  start_time?: string
  end_time?: string
  venue?: string
  status?: string
  payment_type?: string
  participation_type?: string
}

type LookupResult = {
  ok: boolean
  event: any
  student: any
  registration: any
  team?: any
  payment?: any
  payment_required: boolean
  payment_verified: boolean
  registration_confirmed: boolean
  already_checked_in: boolean
  attendance?: any
  can_check_in: boolean
  eligibility_message: string
}

function fmtDate(value?: string) {
  if (!value) return '-'

  const parts = value.split('-')

  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`
  }

  return value
}

function fmtTime(value?: string) {
  if (!value) return '-'

  const [hourText, minute = '00'] = value.split(':')
  const hour = Number(hourText)

  if (Number.isNaN(hour)) return value

  const suffix = hour >= 12 ? 'PM' : 'AM'
  const displayHour = hour % 12 || 12

  return `${displayHour}:${minute} ${suffix}`
}

function fmtCheckIn(value?: string) {
  if (!value) return '-'

  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return parsed.toLocaleString()
}

export default function ScannerPage({ initialEventId = '' }: { initialEventId?: string } = {}) {
  const auth = useAuth() as any

  const [events, setEvents] = useState<ScannerEvent[]>([])
  const [eventId, setEventId] = useState(initialEventId)
  const [manualId, setManualId] = useState('')
  const [lookup, setLookup] = useState<LookupResult | null>(null)

  const [loadingEvents, setLoadingEvents] = useState(true)
  const [finding, setFinding] = useState(false)
  const [checkingIn, setCheckingIn] = useState(false)

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const request = useCallback(async (
    path: string,
    options: RequestInit = {}
  ) => {
    const token =
      auth?.token ||
      auth?.session?.token ||
      localStorage.getItem('token') ||
      localStorage.getItem('authToken') ||
      ''

    const headers: Record<string, string> = {
      ...(options.body
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...(options.headers as Record<string, string> || {})
    }

    if (token) {
      headers.Authorization = `Bearer ${token}`
    }

    const response = await fetch(`${API}${path}`, {
      ...options,
      headers
    })

    let data: any = {}

    try {
      data = await response.json()
    } catch {
      data = {}
    }

    if (!response.ok) {
      throw new Error(
        data?.error ||
        data?.message ||
        'Request failed.'
      )
    }

    return data
  }, [auth])

  const loadEvents = useCallback(async () => {
    setLoadingEvents(true)
    setError('')

    try {
      const data = await request(
        '/api/coordinator/scanner/events'
      )

      const rows = Array.isArray(data?.events)
        ? data.events
        : []

      setEvents(rows)

      if (rows.length === 1) {
        setEventId(String(rows[0].id))
      }
    } catch (err: any) {
      setError(
        err?.message ||
        'Unable to load coordinator events.'
      )
    } finally {
      setLoadingEvents(false)
    }
  }, [request])

  useEffect(() => {
    void loadEvents()
  }, [loadEvents])

  function resetStudent() {
    setLookup(null)
    setSuccess('')
    setError('')
  }

  async function findStudent(event?: FormEvent) {
    event?.preventDefault()

    const studentId = manualId.trim()

    setLookup(null)
    setSuccess('')
    setError('')

    if (!eventId) {
      setError('Choose an event first.')
      return
    }

    if (!studentId) {
      setError('Enter the Student ID.')
      return
    }

    setFinding(true)

    try {
      const data = await request(
        `/api/coordinator/scanner/lookup?event_id=${encodeURIComponent(eventId)}&student_id=${encodeURIComponent(studentId)}`
      )

      setLookup(data)
    } catch (err: any) {
      setError(
        err?.message ||
        'Unable to find this student.'
      )
    } finally {
      setFinding(false)
    }
  }

  async function confirmCheckIn() {
    if (!lookup?.student?.student_id || !eventId) {
      return
    }

    setCheckingIn(true)
    setError('')
    setSuccess('')

    try {
      const data = await request(
        '/api/coordinator/scanner/check-in',
        {
          method: 'POST',
          body: JSON.stringify({
            event_id: Number(eventId),
            student_id: lookup.student.student_id
          })
        }
      )

      setSuccess(
        data?.message ||
        'Check-in completed successfully.'
      )

      setLookup(current => current
        ? {
            ...current,
            can_check_in: false,
            already_checked_in: true,
            attendance:
              data?.attendance ||
              current.attendance,
            eligibility_message:
              'Student is already checked in.'
          }
        : current
      )
    } catch (err: any) {
      setError(
        err?.message ||
        'Unable to complete check-in.'
      )
    } finally {
      setCheckingIn(false)
    }
  }

  function nextStudent() {
    setManualId('')
    setLookup(null)
    setError('')
    setSuccess('')

    window.setTimeout(() => {
      document
        .getElementById('scanner-student-id')
        ?.focus()
    }, 0)
  }

  const selectedEvent = events.find(
    event => String(event.id) === eventId
  )

  const student = lookup?.student
  const registration = lookup?.registration
  const payment = lookup?.payment

  return (
    <section className="portal-content scanner-layout">

      <div className="scanner-card">

        <span className="eyebrow">
          Event Check-In
        </span>

        <h2>Student ID Scanner</h2>

        <p>
          Select the event, enter the student's College
          Student ID, verify the registration and confirm
          attendance.
        </p>

        <div className="scanner-event-field">

          <label htmlFor="scanner-event">
            Event
          </label>

          <select
            id="scanner-event"
            value={eventId}
            disabled={loadingEvents}
            onChange={(e) => {
              setEventId(e.target.value)
              resetStudent()
            }}
          >
            <option value="">
              {loadingEvents
                ? 'Loading events...'
                : 'Select event'}
            </option>

            {events.map(event => (
              <option
                key={event.id}
                value={event.id}
              >
                {event.name}
                {event.event_code
                  ? ` (${event.event_code})`
                  : ''}
              </option>
            ))}
          </select>

        </div>

        {selectedEvent && (
          <div className="scanner-event-summary">

            <div>
              <small>Event</small>
              <b>{selectedEvent.name}</b>
            </div>

            <div>
              <small>Date</small>
              <b>
                {fmtDate(selectedEvent.event_date)}
              </b>
            </div>

            <div>
              <small>Time</small>
              <b>
                {fmtTime(selectedEvent.start_time)}
                {selectedEvent.end_time
                  ? ` - ${fmtTime(selectedEvent.end_time)}`
                  : ''}
              </b>
            </div>

            <div>
              <small>Venue</small>
              <b>{selectedEvent.venue || '-'}</b>
            </div>

          </div>
        )}

        <div className="camera-placeholder">
          <div className="scan-line" />

          <span>Camera scanning</span>

          <small>
            Camera barcode support will be enabled after
            the college ID card encoded value is confirmed.
          </small>
        </div>

        <button
          type="button"
          className="button button-primary button-full"
          disabled
          title="Barcode format is not configured yet."
        >
          Camera Scanner - ID Format Required
        </button>

      </div>


      <div className="scanner-side">

        <form
          className="manual-card"
          onSubmit={findStudent}
        >
          <h3>Manual Student Check-In</h3>

          <p>
            Enter the Student ID printed on the
            college ID card.
          </p>

          <label htmlFor="scanner-student-id">
            Student ID
          </label>

          <input
            id="scanner-student-id"
            value={manualId}
            autoComplete="off"
            autoFocus
            placeholder="Enter Student ID"
            onChange={(e) => {
              setManualId(e.target.value)
              setLookup(null)
              setError('')
              setSuccess('')
            }}
          />

          <button
            className="button button-dark button-full"
            type="submit"
            disabled={
              finding ||
              !manualId.trim() ||
              !eventId
            }
          >
            {finding
              ? 'Checking Student...'
              : 'Find Student'}
          </button>

        </form>


        {error && (
          <div
            className="form-alert error"
            role="alert"
          >
            {error}
          </div>
        )}


        {success && (
          <div
            className="form-alert success"
            role="status"
          >
            {success}
          </div>
        )}


        {lookup && student && (
          <div className="scanner-result-card">

            <div className="scanner-result-head">

              <div className="scanner-student-avatar">
                {String(student.name || 'S')
                  .slice(0, 1)
                  .toUpperCase()}
              </div>

              <div>
                <span className="eyebrow">
                  Student Verified
                </span>

                <h3>{student.name}</h3>

                <p>{student.student_id}</p>
              </div>

            </div>


            <div className="scanner-student-grid">

              <div>
                <small>Department</small>
                <b>{student.department || '-'}</b>
              </div>

              <div>
                <small>Year</small>
                <b>{student.year || '-'}</b>
              </div>

              <div>
                <small>Semester</small>
                <b>{student.semester || '-'}</b>
              </div>

              <div>
                <small>Student Status</small>
                <b>{student.status || '-'}</b>
              </div>

            </div>


            <div className="scanner-verification-list">

              <div>
                <span>Registration</span>

                <b
                  className={
                    lookup.registration_confirmed
                      ? 'scanner-ok'
                      : 'scanner-bad'
                  }
                >
                  {registration?.status ||
                    'Not registered'}
                </b>
              </div>


              <div>
                <span>Participation</span>

                <b>
                  {registration?.registration_type ||
                    '-'}
                </b>
              </div>


              {registration?.registration_type ===
                'Team' && (
                <div>
                  <span>Team</span>

                  <b>
                    {lookup.team?.team_name ||
                      registration?.subject?.team_name ||
                      '-'}
                  </b>
                </div>
              )}


              <div>
                <span>Payment</span>

                <b
                  className={
                    lookup.payment_verified
                      ? 'scanner-ok'
                      : 'scanner-bad'
                  }
                >
                  {!lookup.payment_required
                    ? 'Not Required'
                    : payment?.status ||
                      'Not Verified'}
                </b>
              </div>


              <div>
                <span>Attendance</span>

                <b
                  className={
                    lookup.already_checked_in
                      ? 'scanner-ok'
                      : lookup.can_check_in
                        ? 'scanner-ready'
                        : 'scanner-bad'
                  }
                >
                  {lookup.already_checked_in
                    ? 'Checked In'
                    : lookup.can_check_in
                      ? 'Ready'
                      : 'Blocked'}
                </b>
              </div>

            </div>


            <div
              className={
                lookup.can_check_in
                  ? 'scanner-decision ready'
                  : lookup.already_checked_in
                    ? 'scanner-decision done'
                    : 'scanner-decision blocked'
              }
            >
              <b>
                {lookup.eligibility_message}
              </b>

              {lookup.already_checked_in &&
                lookup.attendance?.check_in_at && (
                  <small>
                    Check-in time:{' '}
                    {fmtCheckIn(
                      lookup.attendance.check_in_at
                    )}
                  </small>
                )}
            </div>


            {lookup.can_check_in ? (
              <button
                type="button"
                className="button button-primary button-full"
                disabled={checkingIn}
                onClick={confirmCheckIn}
              >
                {checkingIn
                  ? 'Confirming Check-In...'
                  : 'Confirm Check-In'}
              </button>
            ) : (
              <button
                type="button"
                className="button button-ghost button-full"
                onClick={nextStudent}
              >
                Check Next Student
              </button>
            )}

          </div>
        )}


        <div className="scanner-help">

          <b>Check-in verification</b>

          <span>
            1. Student exists in Student Directory
          </span>

          <span>
            2. Student is registered for selected event
          </span>

          <span>
            3. Registration status is Confirmed
          </span>

          <span>
            4. Paid event payment is verified
          </span>

          <span>
            5. Duplicate attendance is blocked
          </span>

          <span>
            6. Successful entry appears in Attendance Report
          </span>

        </div>

      </div>

    </section>
  )
}
