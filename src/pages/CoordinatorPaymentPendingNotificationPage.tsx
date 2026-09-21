import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthContext'

import { API } from '../lib/api'

type EventRow = {
  id: number
  name: string
  event_code: string
  status: string
}

type RegistrationRow = {
  id: number
  registration_type: string
  status: string
  subject?: any
  payment?: {
    amount?: number
    status?: string
  } | null
}

export default function CoordinatorPaymentPendingNotificationPage() {
  const { token } = useAuth()

  const [events, setEvents] = useState<EventRow[]>([])
  const [eventId, setEventId] = useState('')
  const [registrations, setRegistrations] = useState<RegistrationRow[]>([])
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    async function loadEvents() {
      try {
        setError('')

        const response = await fetch(
          `${API}/api/events/manage`,
          {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        )

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Unable to load events.')
        }

        const rows: EventRow[] = data.rows || data.events || []

        setEvents(rows)

        if (rows.length > 0) {
          setEventId(String(rows[0].id))
        }
      } catch (err: any) {
        setError(err.message || 'Unable to load events.')
      }
    }

    if (token) loadEvents()
  }, [token])

  useEffect(() => {
    async function loadPending() {
      if (!eventId) {
        setRegistrations([])
        return
      }

      setLoading(true)
      setError('')
      setSuccess('')

      try {
        const response = await fetch(
          `${API}/api/registrations/manage?event_id=${encodeURIComponent(
            eventId
          )}&status=${encodeURIComponent('Payment Pending')}`,
          {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        )

        const data = await response.json()

        if (!response.ok) {
          throw new Error(
            data.error ||
            'Unable to load payment-pending registrations.'
          )
        }

        setRegistrations(data.rows || [])
      } catch (err: any) {
        setRegistrations([])
        setError(
          err.message ||
          'Unable to load payment-pending registrations.'
        )
      } finally {
        setLoading(false)
      }
    }

    if (token) loadPending()
  }, [eventId, token])

  const participantCount = useMemo(() => {
    const studentIds = new Set<string>()

    registrations.forEach(registration => {
      const subject = registration.subject

      if (registration.registration_type === 'Individual') {
        if (subject?.student_id) {
          studentIds.add(subject.student_id)
        }

        return
      }

      if (Array.isArray(subject?.members)) {
        subject.members.forEach((member: any) => {
          if (
            member?.student_id &&
            member?.status !== 'Declined'
          ) {
            studentIds.add(member.student_id)
          }
        })
      }
    })

    return studentIds.size
  }, [registrations])

  const pendingAmount = useMemo(() => {
    return registrations.reduce(
      (total, registration) =>
        total + Number(registration.payment?.amount || 0),
      0
    )
  }, [registrations])

  const selectedEvent = events.find(
    event => String(event.id) === eventId
  )

  async function send(event: FormEvent) {
    event.preventDefault()

    if (
      !eventId ||
      participantCount === 0 ||
      !title.trim() ||
      !message.trim()
    ) {
      return
    }

    const confirmed = window.confirm(
      `Send payment reminder to ${participantCount} participant(s)?`
    )

    if (!confirmed) return

    setSending(true)
    setError('')
    setSuccess('')

    try {
      const response = await fetch(
        `${API}/api/coordinator/notifications/payment-pending`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            event_id: Number(eventId),
            title: title.trim(),
            message: message.trim()
          })
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          data.error ||
          'Unable to send payment reminder.'
        )
      }

      setSuccess(
        data.message ||
        'Payment reminder sent successfully.'
      )

      setTitle('')
      setMessage('')
    } catch (err: any) {
      setError(
        err.message ||
        'Unable to send payment reminder.'
      )
    } finally {
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

          <h2>Payment Pending</h2>

          <p>
            Send payment reminders only to participants
            whose registration is waiting for payment.
          </p>
        </div>
      </section>

      <section className="panel communication-event-panel">

        <div className="communication-section-heading">
          <div>
            <span className="eyebrow">Audience</span>
            <h3>Select Event</h3>

            <p>
              Only events you are permitted to coordinate
              are available.
            </p>
          </div>

          <div className="communication-recipient-count">
            <strong>{participantCount}</strong>
            <span>Payment Pending</span>
          </div>
        </div>

        <label className="communication-field">
          <span>Event</span>

          <select
            value={eventId}
            onChange={e => setEventId(e.target.value)}
          >
            <option value="">
              Select event
            </option>

            {events.map(event => (
              <option
                value={event.id}
                key={event.id}
              >
                {event.name} - {event.event_code} - {event.status}
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
              <span>Pending Registrations</span>
              <strong>{registrations.length}</strong>
            </div>

            <div>
              <span>Pending Amount</span>
              <strong>
                Rs. {pendingAmount.toLocaleString('en-IN')}
              </strong>
            </div>

          </div>
        )}

        {loading && (
          <p className="muted">
            Loading payment-pending registrations...
          </p>
        )}

        {!loading &&
          eventId &&
          participantCount === 0 && (
            <div
              style={{
                marginTop: 20,
                padding: 18,
                border: '1px solid #dbe6f3',
                borderRadius: 14
              }}
            >
              <strong>
                No payment-pending registrations found
                for this event.
              </strong>

              <p className="muted">
                Participants will appear here when their
                registration status becomes Payment Pending.
              </p>
            </div>
          )}

      </section>

      <section className="panel communication-compose-panel">

        <div className="communication-section-heading">
          <div>
            <span className="eyebrow">Message</span>

            <h3>Compose Payment Reminder</h3>

            <p>
              Payment verification remains separate in
              the Offline Payment module.
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
              onChange={e => setTitle(e.target.value)}
              placeholder="Example: Event payment pending"
              maxLength={120}
              required
            />
          </label>

          <label className="communication-field">
            <span>Message</span>

            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Write the payment reminder..."
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
              className="button button-primary"
              type="submit"
              disabled={
                sending ||
                !eventId ||
                participantCount === 0 ||
                !title.trim() ||
                !message.trim()
              }
            >
              {sending
                ? 'Sending...'
                : 'Send Payment Reminder'}
            </button>

          </div>

        </form>
      </section>

    </div>
  )
}
