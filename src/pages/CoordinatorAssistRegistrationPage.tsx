import { FormEvent, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

import { API } from '../lib/api'

type EventOption = {
  id: number
  event_code: string
  name: string
  event_date?: string
  venue?: string
  participation_type?: string
  payment_type?: string
  fee?: number
  capacity?: number | null
  seats_used?: number
  seats_remaining?: number | null
  registration_open_now?: boolean
}

type Student = {
  student_id: string
  name: string
  roll_no?: string | null
  department?: string | null
  year?: number | null
  semester?: number | null
  status?: string | null
}

export default function CoordinatorAssistRegistrationPage() {
  const { token, user } = useAuth()

  const [events, setEvents] = useState<EventOption[]>([])
  const [eventId, setEventId] = useState('')

  const [query, setQuery] = useState('')
  const [students, setStudents] = useState<Student[]>([])
  const [selectedStudent, setSelectedStudent] =
    useState<Student | null>(null)

  const [loadingEvents, setLoadingEvents] = useState(true)
  const [searching, setSearching] = useState(false)
  const [registering, setRegistering] = useState(false)

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    if (!token) return

    async function loadEvents() {
      setLoadingEvents(true)
      setError('')

      try {
        const res = await fetch(
          `${API}/api/registration-events`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        )

        const data = await res.json()

        if (!res.ok) {
          throw new Error(
            data.error || 'Registration events could not be loaded.'
          )
        }

        const available = (data.rows || []).filter(
          (event: EventOption) =>
            event.participation_type !== 'Team'
        )

        setEvents(available)

        if (available[0]) {
          setEventId(String(available[0].id))
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Registration events could not be loaded.'
        )
      } finally {
        setLoadingEvents(false)
      }
    }

    void loadEvents()
  }, [token])

  const selectedEvent =
    events.find((event) => String(event.id) === eventId) || null

  async function searchStudents(event: FormEvent) {
    event.preventDefault()

    if (!token) return

    if (!query.trim()) {
      setError('Enter Student ID, name, roll number or barcode.')
      return
    }

    setSearching(true)
    setError('')
    setSuccess('')
    setSelectedStudent(null)

    try {
      const params = new URLSearchParams({
        q: query.trim(),
        status: 'Active',
        page: '1',
        limit: '20',
      })

      const res = await fetch(
        `${API}/api/students?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )

      const data = await res.json()

      if (!res.ok) {
        throw new Error(
          data.error || 'Student search failed.'
        )
      }

      setStudents(data.rows || [])
    } catch (err) {
      setStudents([])
      setError(
        err instanceof Error
          ? err.message
          : 'Student search failed.'
      )
    } finally {
      setSearching(false)
    }
  }

  async function registerStudent() {
    if (!token || !selectedStudent || !eventId) return

    if (!selectedEvent) {
      setError('Choose an event first.')
      return
    }

    setRegistering(true)
    setError('')
    setSuccess('')

    try {
      const res = await fetch(
        `${API}/api/registrations`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            event_id: Number(eventId),
            registration_type: 'Individual',
            student_id: selectedStudent.student_id,
          }),
        }
      )

      const data = await res.json()

      if (!res.ok) {
        throw new Error(
          data.error || 'Registration could not be completed.'
        )
      }

      const status =
        data.registration?.status || 'Created'

      setSuccess(
        `${selectedStudent.name} registered successfully. Status: ${status}.`
      )

      setSelectedStudent(null)
      setStudents([])
      setQuery('')
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Registration could not be completed.'
      )
    } finally {
      setRegistering(false)
    }
  }

  return (
    <div className="page-stack coordinator-assist-registration-page">
      <section className="page-hero compact">
        <div>
          <span className="eyebrow">
            Department Coordinator Workspace
          </span>

          <h2>Assist Registration</h2>

          <p>
            Search an eligible student and register them for an
            event managed by your department.
          </p>
        </div>
      </section>

      <section className="panel">
        <div className="section-mini-head">
          <div>
            <span className="eyebrow">Step 1</span>
            <h3>Select Event</h3>
          </div>

          <Link
            to="/coordinator/students"
            className="button button-ghost button-small"
          >
            Back
          </Link>
        </div>

        <div style={{ marginTop: 18, maxWidth: 650 }}>
          <label>
            Event
            <select
              value={eventId}
              onChange={(e) => {
                setEventId(e.target.value)
                setSelectedStudent(null)
                setSuccess('')
                setError('')
              }}
              disabled={loadingEvents}
            >
              <option value="">
                {loadingEvents
                  ? 'Loading events...'
                  : 'Select event'}
              </option>

              {events.map((event) => (
                <option
                  key={event.id}
                  value={event.id}
                >
                  {event.name} • {event.event_code}
                </option>
              ))}
            </select>
          </label>
        </div>

        {!loadingEvents && events.length === 0 && (
          <div className="notice" style={{ marginTop: 16 }}>
            No individual registration events are currently
            available for your department.
          </div>
        )}

        {selectedEvent && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fit,minmax(150px,1fr))',
              gap: 12,
              marginTop: 18,
            }}
          >
            <div className="stat-card">
              <span>Event Date</span>
              <strong>
                {selectedEvent.event_date || '—'}
              </strong>
            </div>

            <div className="stat-card">
              <span>Payment</span>
              <strong>
                {selectedEvent.payment_type || 'Free'}
              </strong>
            </div>

            <div className="stat-card">
              <span>Seats Remaining</span>
              <strong>
                {selectedEvent.seats_remaining ?? 'No limit'}
              </strong>
            </div>

            <div className="stat-card">
              <span>Registration</span>
              <strong>
                {selectedEvent.registration_open_now
                  ? 'Open'
                  : 'Not Open'}
              </strong>
            </div>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="section-mini-head">
          <div>
            <span className="eyebrow">Step 2</span>
            <h3>Find Student</h3>
          </div>
        </div>

        <form
          onSubmit={searchStudents}
          style={{
            display: 'flex',
            alignItems: 'end',
            gap: 12,
            flexWrap: 'wrap',
            marginTop: 18,
          }}
        >
          <label
            style={{
              flex: '1 1 420px',
              maxWidth: 650,
            }}
          >
            Student ID / Name / Roll Number / Barcode
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search student..."
            />
          </label>

          <button
            className="button button-primary"
            type="submit"
            disabled={searching || !eventId}
          >
            {searching ? 'Searching...' : 'Search Student'}
          </button>
        </form>

        {students.length > 0 && (
          <div
            style={{
              overflowX: 'auto',
              marginTop: 22,
            }}
          >
            <table style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Student ID</th>
                  <th>Name</th>
                  <th>Roll Number</th>
                  <th>Department</th>
                  <th>Year</th>
                  <th>Semester</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {students.map((student) => (
                  <tr key={student.student_id}>
                    <td>{student.student_id}</td>
                    <td>{student.name}</td>
                    <td>{student.roll_no || '—'}</td>
                    <td>{student.department || '—'}</td>
                    <td>{student.year || '—'}</td>
                    <td>{student.semester || '—'}</td>
                    <td>
                      <button
                        type="button"
                        className="button button-ghost button-small"
                        onClick={() => {
                          setSelectedStudent(student)
                          setError('')
                          setSuccess('')
                        }}
                      >
                        Select
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedStudent && (
        <section className="panel">
          <div className="section-mini-head">
            <div>
              <span className="eyebrow">Step 3</span>
              <h3>Confirm Registration</h3>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fit,minmax(180px,1fr))',
              gap: 14,
              marginTop: 18,
            }}
          >
            <div className="stat-card">
              <span>Student</span>
              <strong>{selectedStudent.name}</strong>
            </div>

            <div className="stat-card">
              <span>Student ID</span>
              <strong>{selectedStudent.student_id}</strong>
            </div>

            <div className="stat-card">
              <span>Department</span>
              <strong>
                {selectedStudent.department || '—'}
              </strong>
            </div>

            <div className="stat-card">
              <span>Event</span>
              <strong>
                {selectedEvent?.name || '—'}
              </strong>
            </div>
          </div>

          <div style={{ marginTop: 20 }}>
            <button
              type="button"
              className="button button-primary"
              onClick={registerStudent}
              disabled={registering}
            >
              {registering
                ? 'Registering...'
                : 'Confirm Registration'}
            </button>
          </div>
        </section>
      )}

      {error && (
        <div className="notice error">
          {error}
        </div>
      )}

      {success && (
        <div className="notice success">
          {success}
        </div>
      )}
    </div>
  )
}
