import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthContext'

import { API } from '../lib/api'

type EventOption = {
  id: number
  event_code: string
  name: string
  payment_type: string
  offline_payment: boolean
}

type StudentSubject = {
  student_id?: string
  name?: string
  roll_no?: string
  department?: string
}

type TeamSubject = {
  team_name?: string
  team_code?: string
  leader_student_id?: string
}

type Registration = {
  id: number
  registration_type: 'Individual' | 'Team'
  status: string
  student_id?: string | null
  team_id?: number | null
  subject?: StudentSubject | TeamSubject | null
  payment?: {
    id: number
    amount: number
    status: string
    method?: string
  } | null
}

export default function CoordinatorOfflinePaymentPage() {
  const { token } = useAuth()

  const [events, setEvents] = useState<EventOption[]>([])
  const [eventId, setEventId] = useState('')
  const [rows, setRows] = useState<Registration[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const [method, setMethod] = useState<'Cash' | 'Coordinator UPI'>('Cash')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')

  const [loadingEvents, setLoadingEvents] = useState(true)
  const [loadingRows, setLoadingRows] = useState(false)
  const [saving, setSaving] = useState(false)

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const headers = useMemo(
    () => ({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }),
    [token]
  )

  const selected = rows.find(row => row.id === selectedId) || null

  async function loadEvents() {
    setLoadingEvents(true)
    setError('')

    try {
      const response = await fetch(`${API}/api/events/manage`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Could not load events.')
      }

      const available = (data.rows || []).filter(
        (event: EventOption) =>
          event.payment_type === 'Paid' &&
          Boolean(event.offline_payment)
      )

      setEvents(available)

      if (available[0]) {
        setEventId(String(available[0].id))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load events.')
    } finally {
      setLoadingEvents(false)
    }
  }

  async function loadPendingRegistrations(id: string) {
    if (!id) {
      setRows([])
      setSelectedId(null)
      return
    }

    setLoadingRows(true)
    setError('')
    setSuccess('')
    setSelectedId(null)

    try {
      const response = await fetch(
        `${API}/api/registrations/manage?event_id=${encodeURIComponent(id)}&status=${encodeURIComponent('Payment Pending')}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Could not load pending payments.')
      }

      setRows(data.rows || [])
    } catch (err) {
      setRows([])
      setError(
        err instanceof Error
          ? err.message
          : 'Could not load pending payments.'
      )
    } finally {
      setLoadingRows(false)
    }
  }

  useEffect(() => {
    loadEvents()
  }, [])

  useEffect(() => {
    if (eventId) {
      loadPendingRegistrations(eventId)
    } else {
      setRows([])
    }
  }, [eventId])

  function participantName(row: Registration) {
    if (row.registration_type === 'Team') {
      const team = row.subject as TeamSubject | null
      return team?.team_name || `Team #${row.team_id || ''}`
    }

    const student = row.subject as StudentSubject | null
    return student?.name || row.student_id || 'Student'
  }

  function participantDetail(row: Registration) {
    if (row.registration_type === 'Team') {
      const team = row.subject as TeamSubject | null
      return team?.team_code || `Team registration #${row.id}`
    }

    const student = row.subject as StudentSubject | null

    return [
      student?.student_id || row.student_id,
      student?.roll_no,
      student?.department,
    ]
      .filter(Boolean)
      .join(' • ')
  }

  async function verifyPayment() {
    if (!selected) return

    if (method === 'Coordinator UPI' && !reference.trim()) {
      setError('Enter the UPI transaction/reference ID.')
      return
    }

    const confirmed = window.confirm(
      `Verify ₹${Number(selected.payment?.amount || 0).toFixed(2)} payment for ${participantName(selected)}?`
    )

    if (!confirmed) return

    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const response = await fetch(
        `${API}/api/payments/registration/${selected.id}/offline-verify`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            method,
            provider_reference:
              method === 'Coordinator UPI' ? reference.trim() : '',
            notes: notes.trim(),
          }),
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Payment verification failed.')
      }

      setSuccess(
        `Payment verified successfully. Registration #${selected.id} is now confirmed.`
      )

      setReference('')
      setNotes('')
      setMethod('Cash')
      setSelectedId(null)

      await loadPendingRegistrations(eventId)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Payment verification failed.'
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page-stack coordinator-offline-payment-page">
      <section className="page-hero compact">
        <div>
          <span className="eyebrow">Coordinator • Students</span>
          <h2>Offline Payment</h2>
          <p>
            Verify authorized Cash or Coordinator UPI collections for
            registrations waiting for payment.
          </p>
        </div>
      </section>

      <section className="panel">
        <div className="offline-payment-event-field">
          <label>
            Event
            <select
              value={eventId}
              onChange={event => setEventId(event.target.value)}
              disabled={loadingEvents}
            >
              <option value="">
                {loadingEvents
                  ? 'Loading events...'
                  : 'Select paid event'}
              </option>

              {events.map(event => (
                <option key={event.id} value={event.id}>
                  {event.name} • {event.event_code}
                </option>
              ))}
            </select>
          </label>
        </div>

        {!loadingEvents && events.length === 0 && (
          <div className="empty-state">
            No manageable paid event currently has offline payment enabled.
          </div>
        )}

        {error && <div className="form-error">{error}</div>}
        {success && <div className="form-success">{success}</div>}
      </section>

      {eventId && (
        <section className="panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Payment Queue</span>
              <h3>Pending Payments</h3>
            </div>

            <button
              type="button"
              className="button button-secondary"
              onClick={() => loadPendingRegistrations(eventId)}
              disabled={loadingRows}
            >
              {loadingRows ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          {loadingRows ? (
            <div className="empty-state">Loading pending payments...</div>
          ) : rows.length === 0 ? (
            <div className="empty-state">
              No registrations are currently waiting for payment.
            </div>
          ) : (
            <div className="offline-payment-list">
              {rows.map(row => (
                <button
                  type="button"
                  key={row.id}
                  className={`offline-payment-row ${
                    selectedId === row.id ? 'is-selected' : ''
                  }`}
                  onClick={() => {
                    setSelectedId(row.id)
                    setError('')
                    setSuccess('')
                  }}
                >
                  <span className="offline-payment-person">
                    <strong>{participantName(row)}</strong>
                    <small>{participantDetail(row)}</small>
                  </span>

                  <span className="offline-payment-type">
                    {row.registration_type}
                  </span>

                  <span className="offline-payment-amount">
                    ₹{Number(row.payment?.amount || 0).toFixed(2)}
                  </span>

                  <span className="offline-payment-status">
                    Payment Pending
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {selected && (
        <section className="panel offline-payment-verify-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Selected Registration</span>
              <h3>{participantName(selected)}</h3>
              <p>{participantDetail(selected)}</p>
            </div>

            <div className="offline-payment-total">
              <span>Amount</span>
              <strong>
                ₹{Number(selected.payment?.amount || 0).toFixed(2)}
              </strong>
            </div>
          </div>

          <div className="offline-payment-form">
            <label>
              Payment Method
              <select
                value={method}
                onChange={event => {
                  const value = event.target.value as
                    | 'Cash'
                    | 'Coordinator UPI'

                  setMethod(value)

                  if (value === 'Cash') {
                    setReference('')
                  }
                }}
              >
                <option value="Cash">Cash</option>
                <option value="Coordinator UPI">Coordinator UPI</option>
              </select>
            </label>

            {method === 'Coordinator UPI' && (
              <label>
                UPI Transaction / Reference ID
                <input
                  value={reference}
                  onChange={event => setReference(event.target.value)}
                  placeholder="Enter transaction/reference ID"
                />
              </label>
            )}

            <label>
              Notes
              <textarea
                value={notes}
                onChange={event => setNotes(event.target.value)}
                placeholder="Optional payment note"
                rows={3}
              />
            </label>

            <div className="offline-payment-warning">
              Verify the received amount before confirming. This action marks
              the payment as Paid and the registration as Confirmed.
            </div>

            <button
              type="button"
              className="button button-primary"
              onClick={verifyPayment}
              disabled={saving}
            >
              {saving ? 'Verifying Payment...' : 'Verify Payment'}
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
