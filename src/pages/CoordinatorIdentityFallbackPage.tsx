import { FormEvent, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'

import { API } from '../lib/api'

type EventOption = {
  id: number
  event_code: string
  name: string
  status: string
}

type Student = {
  student_id: string
  name: string
  department: string
  year: number
  semester?: number | null
  batch?: string | null
  roll_no?: string | null
  barcode_value?: string | null
  email?: string | null
  phone?: string | null
  photo_url?: string | null
  status: string
}

type Verification = {
  id: number
  method: string
  reason: string
  status: string
  reviewed_at?: string | null
  approved_by_name?: string | null
}

type IdentityResult = {
  student: Student
  registered: boolean
  registration?: {
    id: number
    status: string
    registration_type: string
  } | null
  verification?: Verification | null
}

export default function CoordinatorIdentityFallbackPage() {
  const { token } = useAuth()

  const [events,setEvents] = useState<EventOption[]>([])
  const [eventId,setEventId] = useState('')
  const [query,setQuery] = useState('')
  const [students,setStudents] = useState<Student[]>([])
  const [selected,setSelected] = useState<IdentityResult | null>(null)

  const [reason,setReason] = useState('')
  const [loadingEvents,setLoadingEvents] = useState(true)
  const [searching,setSearching] = useState(false)
  const [loadingStudent,setLoadingStudent] = useState(false)
  const [saving,setSaving] = useState(false)

  const [error,setError] = useState('')
  const [message,setMessage] = useState('')

  useEffect(() => {
    loadEvents()
  }, [])

  async function loadEvents() {
    setLoadingEvents(true)
    setError('')

    try{
      const response=await fetch(
        `${API}/api/events/manage`,
        {
          headers:{
            Authorization:`Bearer ${token}`
          }
        }
      )

      const data=await response.json()

      if(!response.ok){
        throw new Error(
          data.error || 'Could not load events.'
        )
      }

      const rows=(data.rows || []).filter(
        (event:EventOption) =>
          [
            'Published',
            'Registration Open',
            'Registration Closed',
            'Ongoing',
            'Completed'
          ].includes(event.status)
      )

      setEvents(rows)

      if(rows[0]){
        setEventId(String(rows[0].id))
      }

    }catch(err){
      setError(
        err instanceof Error
          ? err.message
          : 'Could not load events.'
      )
    }finally{
      setLoadingEvents(false)
    }
  }

  async function searchStudents(event:FormEvent) {
    event.preventDefault()

    if(!eventId){
      setError('Select an event first.')
      return
    }

    if(!query.trim()){
      setError('Enter Student ID, name, roll number or barcode.')
      return
    }

    setSearching(true)
    setError('')
    setMessage('')
    setSelected(null)

    try{
      const response=await fetch(
        `${API}/api/students?q=${encodeURIComponent(query.trim())}&status=Active&page=1&limit=20`,
        {
          headers:{
            Authorization:`Bearer ${token}`
          }
        }
      )

      const data=await response.json()

      if(!response.ok){
        throw new Error(
          data.error || 'Student search failed.'
        )
      }

      setStudents(data.rows || [])

    }catch(err){
      setStudents([])
      setError(
        err instanceof Error
          ? err.message
          : 'Student search failed.'
      )
    }finally{
      setSearching(false)
    }
  }

  async function selectStudent(student:Student) {
    if(!eventId)return

    setLoadingStudent(true)
    setError('')
    setMessage('')
    setReason('')

    try{
      const response=await fetch(
        `${API}/api/identity-verification/${eventId}/${encodeURIComponent(student.student_id)}`,
        {
          headers:{
            Authorization:`Bearer ${token}`
          }
        }
      )

      const data=await response.json()

      if(!response.ok){
        throw new Error(
          data.error || 'Could not load identity details.'
        )
      }

      setSelected(data)

    }catch(err){
      setSelected(null)
      setError(
        err instanceof Error
          ? err.message
          : 'Could not load identity details.'
      )
    }finally{
      setLoadingStudent(false)
    }
  }

  async function approveIdentity() {
    if(!selected)return

    if(!selected.registered){
      setError(
        'This student is not registered for the selected event.'
      )
      return
    }

    if(!reason.trim() || reason.trim().length < 5){
      setError(
        'Enter a clear verification reason.'
      )
      return
    }

    if(!selected.student.photo_url){
      const continueWithoutPhoto=window.confirm(
        'No stored student photo is available. Continue only if you have verified the student using other official college details.'
      )

      if(!continueWithoutPhoto)return
    }

    const confirmed=window.confirm(
      `Approve identity for ${selected.student.name}?`
    )

    if(!confirmed)return

    setSaving(true)
    setError('')
    setMessage('')

    try{
      const response=await fetch(
        `${API}/api/identity-verification`,
        {
          method:'POST',
          headers:{
            Authorization:`Bearer ${token}`,
            'Content-Type':'application/json'
          },
          body:JSON.stringify({
            event_id:Number(eventId),
            student_id:selected.student.student_id,
            reason:reason.trim()
          })
        }
      )

      const data=await response.json()

      if(!response.ok){
        throw new Error(
          data.error || 'Identity verification failed.'
        )
      }

      setMessage(
        `${selected.student.name}'s identity was verified successfully.`
      )

      setSelected(current =>
        current
          ? {
              ...current,
              verification:data.verification
            }
          : current
      )

      setReason('')

    }catch(err){
      setError(
        err instanceof Error
          ? err.message
          : 'Identity verification failed.'
      )
    }finally{
      setSaving(false)
    }
  }

  return (
    <div className="page-stack coordinator-identity-fallback-page">

      <section className="page-hero compact">
        <div>
          <span className="eyebrow">
            Coordinator • Students
          </span>

          <h2>Identity Fallback</h2>

          <p>
            Manually verify a registered student when the normal
            college ID or barcode check is unavailable.
          </p>
        </div>
      </section>

      <section className="panel identity-search-panel">

        <form
          className="identity-search-form"
          onSubmit={searchStudents}
        >
          <label>
            Event

            <select
              value={eventId}
              disabled={loadingEvents}
              onChange={event => {
                setEventId(event.target.value)
                setSelected(null)
                setStudents([])
                setMessage('')
                setError('')
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
                  {event.name} • {event.event_code}
                </option>
              ))}
            </select>
          </label>

          <label>
            Search Student

            <input
              value={query}
              onChange={event =>
                setQuery(event.target.value)
              }
              placeholder="Student ID, name, roll number or barcode"
            />
          </label>

          <button
            type="submit"
            className="button button-primary"
            disabled={searching || !eventId}
          >
            {searching
              ? 'Searching...'
              : 'Search Student'}
          </button>
        </form>

        {error && (
          <div className="form-error">
            {error}
          </div>
        )}

        {message && (
          <div className="form-success">
            {message}
          </div>
        )}

      </section>

      {students.length > 0 && (
        <section className="panel">

          <div className="section-heading">
            <div>
              <span className="eyebrow">
                Student Directory
              </span>
              <h3>Select Student</h3>
            </div>
          </div>

          <div className="identity-student-list">

            {students.map(student => (
              <button
                type="button"
                key={student.student_id}
                className="identity-student-row"
                onClick={() =>
                  selectStudent(student)
                }
                disabled={loadingStudent}
              >
                <div className="identity-list-avatar">
                  {student.photo_url ? (
                    <img
                      src={student.photo_url}
                      alt=""
                    />
                  ) : (
                    <span>
                      {student.name
                        ?.charAt(0)
                        .toUpperCase()}
                    </span>
                  )}
                </div>

                <span>
                  <strong>{student.name}</strong>
                  <small>
                    {student.student_id}
                    {student.roll_no
                      ? ` • ${student.roll_no}`
                      : ''}
                  </small>
                </span>

                <span>
                  {student.department}
                  <small>
                    Year {student.year}
                  </small>
                </span>

                <b>Review</b>
              </button>
            ))}

          </div>
        </section>
      )}

      {selected && (
        <section className="panel identity-review-panel">

          <div className="section-heading">
            <div>
              <span className="eyebrow">
                Manual Identity Review
              </span>

              <h3>
                {selected.student.name}
              </h3>

              <p>
                Compare the student with the stored
                college information before approving.
              </p>
            </div>

            <span
              className={
                selected.registered
                  ? 'identity-registration-badge valid'
                  : 'identity-registration-badge invalid'
              }
            >
              {selected.registered
                ? 'Registered'
                : 'Not Registered'}
            </span>
          </div>

          <div className="identity-review-grid">

            <div className="identity-photo-card">

              {selected.student.photo_url ? (
                <img
                  src={selected.student.photo_url}
                  alt={`Stored profile of ${selected.student.name}`}
                />
              ) : (
                <div className="identity-photo-missing">
                  <strong>No student photo available</strong>
                  <span>
                    Verify using official college details
                    before continuing.
                  </span>
                </div>
              )}

              <small>
                Stored Student Directory Photo
              </small>
            </div>

            <div className="identity-details-card">

              <div>
                <span>Student ID</span>
                <strong>
                  {selected.student.student_id}
                </strong>
              </div>

              <div>
                <span>Roll Number</span>
                <strong>
                  {selected.student.roll_no || '—'}
                </strong>
              </div>

              <div>
                <span>Department</span>
                <strong>
                  {selected.student.department}
                </strong>
              </div>

              <div>
                <span>Year</span>
                <strong>
                  {selected.student.year}
                </strong>
              </div>

              <div>
                <span>Semester</span>
                <strong>
                  {selected.student.semester || '—'}
                </strong>
              </div>

              <div>
                <span>Registration</span>
                <strong>
                  {selected.registration
                    ? `#${selected.registration.id} • ${selected.registration.status}`
                    : 'Not found'}
                </strong>
              </div>

            </div>
          </div>

          {selected.verification?.status === 'Approved' ? (

            <div className="identity-approved-box">
              <strong>Identity already verified</strong>

              <span>
                Method: {selected.verification.method}
              </span>

              <span>
                Reason: {selected.verification.reason}
              </span>

              {selected.verification.approved_by_name && (
                <span>
                  Verified by: {
                    selected.verification.approved_by_name
                  }
                </span>
              )}
            </div>

          ) : (

            <div className="identity-approval-form">

              <label>
                Verification Reason

                <textarea
                  value={reason}
                  onChange={event =>
                    setReason(event.target.value)
                  }
                  rows={4}
                  placeholder="Example: Student photo and college details manually matched."
                  disabled={!selected.registered}
                />
              </label>

              <div className="identity-review-note">
                Identity verification does not automatically
                mark attendance. Attendance/check-in remains
                a separate action.
              </div>

              <button
                type="button"
                className="button button-primary"
                disabled={
                  saving ||
                  !selected.registered
                }
                onClick={approveIdentity}
              >
                {saving
                  ? 'Verifying...'
                  : 'Approve Identity'}
              </button>

            </div>
          )}

        </section>
      )}

    </div>
  )
}
