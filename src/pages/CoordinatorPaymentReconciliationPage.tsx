import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthContext'

import { API } from '../lib/api'

type EventOption = {
  id:number
  event_code:string
  name:string
  payment_type:string
  fee?:number
}

type Subject = {
  name?:string
  student_id?:string
  roll_no?:string
  department?:string
  team_name?:string
  team_code?:string
}

type PaymentRow = {
  id:number
  registration_id?:number | null
  student_id?:string | null
  team_id?:number | null
  amount:number
  method:string
  provider_reference?:string | null
  receipt_no?:string | null
  status:string
  collector_name?:string | null
  notes?:string | null
  created_at:string
  updated_at:string
  registration_type?:string
  registration_status?:string
  registration_source?:string
  subject?:Subject | null
}

type Summary = {
  records:number
  paid_count:number
  paid_total:number
  pending_count:number
  pending_total:number
  failed_count:number
  refunded_count:number
  voided_count:number
  method_totals:Record<
    string,
    {count:number;amount:number}
  >
}

const emptySummary:Summary = {
  records:0,
  paid_count:0,
  paid_total:0,
  pending_count:0,
  pending_total:0,
  failed_count:0,
  refunded_count:0,
  voided_count:0,
  method_totals:{}
}

export default function CoordinatorPaymentReconciliationPage({ initialEventId = '' }: { initialEventId?: string } = {}){
  const {token,user}=useAuth()

  const [events,setEvents]=useState<EventOption[]>([])
  const [eventId,setEventId]=useState(initialEventId)
  const [rows,setRows]=useState<PaymentRow[]>([])
  const [summary,setSummary]=useState<Summary>(emptySummary)

  const [status,setStatus]=useState('')
  const [method,setMethod]=useState('')
  const [query,setQuery]=useState('')

  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')
  const [refreshKey,setRefreshKey]=useState(0)

  // PAYMENT VERIFY FRONTEND V1
  const [verifyRow,setVerifyRow]=useState<PaymentRow | null>(null)
  const [verifyMethod,setVerifyMethod]=useState('Cash')
  const [verifyReference,setVerifyReference]=useState('')
  const [verifyReceipt,setVerifyReceipt]=useState('')
  const [verifyNotes,setVerifyNotes]=useState('')
  const [verifying,setVerifying]=useState(false)
  const [success,setSuccess]=useState('')

  useEffect(()=>{
    async function loadEvents(){
      try{
        setError('')

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

        const available=(data.rows || []).filter(
          (event:EventOption)=>
            event.payment_type === 'Paid'
        )

        setEvents(available)

        if(available[0]){
          setEventId(current => available.some((event: {id:number}) => String(event.id) === current) ? current : String(available[0].id))
        }
      }catch(err){
        setError(
          err instanceof Error
            ? err.message
            : 'Could not load events.'
        )
      }
    }

    loadEvents()
  },[token])

  useEffect(()=>{
    if(!eventId){
      setRows([])
      setSummary(emptySummary)
      return
    }

    async function loadReport(){
      setLoading(true)
      setError('')

      try{
        const response=await fetch(
          `${API}/api/coordinator/reports/payments?event_id=${encodeURIComponent(eventId)}`,
          {
            headers:{
              Authorization:`Bearer ${token}`
            }
          }
        )

        const data=await response.json()

        if(!response.ok){
          throw new Error(
            data.error || 'Could not load payment report.'
          )
        }

        setRows(data.rows || [])
        setSummary(data.summary || emptySummary)
      }catch(err){
        setRows([])
        setSummary(emptySummary)

        setError(
          err instanceof Error
            ? err.message
            : 'Could not load payment report.'
        )
      }finally{
        setLoading(false)
      }
    }

    loadReport()
  },[eventId,token,refreshKey])

  const selectedEvent=events.find(
    event=>String(event.id)===eventId
  )

  const methods=useMemo(
    ()=>Array.from(
      new Set(
        rows
          .map(row=>row.method)
          .filter(Boolean)
      )
    ),
    [rows]
  )

  function participant(row:PaymentRow){
    if(row.registration_type==='Team'){
      return (
        row.subject?.team_name ||
        row.subject?.team_code ||
        `Team #${row.team_id || ''}`
      )
    }

    return (
      row.subject?.name ||
      row.subject?.student_id ||
      row.student_id ||
      'Student'
    )
  }

  function participantDetail(row:PaymentRow){
    if(row.registration_type==='Team'){
      return row.subject?.team_code || 'Team'
    }

    return [
      row.subject?.student_id || row.student_id,
      row.subject?.roll_no,
      row.subject?.department
    ].filter(Boolean).join(' | ')
  }

  const filteredRows=useMemo(()=>{
    const needle=query.trim().toLowerCase()

    return rows.filter(row=>{
      if(status && row.status!==status) return false
      if(method && row.method!==method) return false

      if(needle){
        const haystack=[
          participant(row),
          participantDetail(row),
          row.registration_id,
          row.provider_reference,
          row.receipt_no,
          row.collector_name,
          row.method,
          row.status
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()

        if(!haystack.includes(needle)) return false
      }

      return true
    })
  },[rows,status,method,query])

  function money(value:number){
    return `Rs. ${Number(value || 0).toLocaleString(
      'en-IN',
      {
        minimumFractionDigits:2,
        maximumFractionDigits:2
      }
    )}`
  }

  function formatDate(value:string){
    if(!value) return '-'

    const date=new Date(
      value.includes('T')
        ? value
        : value.replace(' ','T')+'Z'
    )

    if(Number.isNaN(date.getTime())) return value

    return date.toLocaleString('en-IN')
  }

  function csvEscape(value:unknown){
    return `"${String(value ?? '').replace(/"/g,'""')}"`
  }

  async function verifyPayment(){
    if(!verifyRow) return

    if(
      verifyMethod==='Coordinator UPI' &&
      !verifyReference.trim()
    ){
      setError('UPI transaction/reference ID is required.')
      return
    }

    setVerifying(true)
    setError('')
    setSuccess('')

    try{
      const response=await fetch(
        `${API}/api/coordinator/payments/${verifyRow.id}/verify`,
        {
          method:'POST',
          headers:{
            'Content-Type':'application/json',
            Authorization:`Bearer ${token}`
          },
          body:JSON.stringify({
            method:verifyMethod,
            reference:verifyReference.trim(),
            receipt_no:verifyReceipt.trim(),
            notes:verifyNotes.trim()
          })
        }
      )

      const data=await response.json()

      if(!response.ok){
        throw new Error(
          data.error || 'Payment could not be verified.'
        )
      }

      setSuccess(data.message || 'Payment verified successfully.')
      setVerifyRow(null)
      setVerifyMethod('Cash')
      setVerifyReference('')
      setVerifyReceipt('')
      setVerifyNotes('')
      setRefreshKey(value=>value+1)

    }catch(err){
      setError(
        err instanceof Error
          ? err.message
          : 'Payment could not be verified.'
      )
    }finally{
      setVerifying(false)
    }
  }

  function openVerify(row:PaymentRow){
    setError('')
    setSuccess('')
    setVerifyRow(row)
    setVerifyMethod('Cash')
    setVerifyReference('')
    setVerifyReceipt('')
    setVerifyNotes('')
  }

  function exportCSV(){
    if(!filteredRows.length){
      window.alert(
        'There are no payment records to export.'
      )
      return
    }

    const headers=[
      'Payment ID',
      'Registration ID',
      'Event Code',
      'Event',
      'Participant',
      'Participant Detail',
      'Amount',
      'Status',
      'Method',
      'Reference',
      'Receipt',
      'Collected By',
      'Registration Status',
      'Registration Source',
      'Notes',
      'Created'
    ]

    const data=filteredRows.map(row=>[
      row.id,
      row.registration_id || '',
      selectedEvent?.event_code || '',
      selectedEvent?.name || '',
      participant(row),
      participantDetail(row),
      Number(row.amount || 0).toFixed(2),
      row.status,
      row.method,
      row.provider_reference || '',
      row.receipt_no || '',
      row.collector_name || '',
      row.registration_status || '',
      row.registration_source || '',
      row.notes || '',
      formatDate(row.created_at)
    ])

    const csv=[
      headers.map(csvEscape).join(','),
      ...data.map(values=>
        values.map(csvEscape).join(',')
      )
    ].join('\r\n')

    const blob=new Blob(
      ['\uFEFF'+csv],
      {type:'text/csv;charset=utf-8'}
    )

    const url=URL.createObjectURL(blob)
    const link=document.createElement('a')

    link.href=url
    link.download=
      `payment-reconciliation-${selectedEvent?.event_code || 'event'}.csv`

    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="page-stack payment-reconciliation-page">

      <section className="page-hero compact payment-report-hero">
        <div>
          <span className="eyebrow">
            Coordinator | Reports
          </span>

          <h2>Payment Reconciliation</h2>

          <p>
            Review current payment records, collection
            methods and pending amounts for your event.
          </p>
        </div>

        <div className="payment-report-actions">
          <button
            className="button"
            type="button"
            onClick={()=>setRefreshKey(value=>value+1)}
            disabled={!eventId || loading}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>

          <button
            className="button"
            type="button"
            onClick={exportCSV}
            disabled={!filteredRows.length}
          >
            Export CSV
          </button>

          <button
            className="button button-primary"
            type="button"
            onClick={()=>window.print()}
            disabled={!eventId}
          >
            Print / PDF
          </button>
        </div>
      </section>

      {error && (
        <div className="alert error-alert">
          {error}
        </div>
      )}

      {success && (
        <div className="alert success-alert">
          {success}
        </div>
      )}

      <section className="panel payment-report-filter-panel">
        <div className="payment-report-filters">

          <label>
            <span>Event</span>
            <select
              value={eventId}
              onChange={event=>setEventId(event.target.value)}
            >
              <option value="">Select event</option>

              {events.map(event=>(
                <option
                  key={event.id}
                  value={event.id}
                >
                  {event.event_code} | {event.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Status</span>
            <select
              value={status}
              onChange={event=>setStatus(event.target.value)}
            >
              <option value="">All statuses</option>
              <option value="Paid">Paid</option>
              <option value="Pending">Pending</option>
              <option value="Failed">Failed</option>
              <option value="Refunded">Refunded</option>
              <option value="Voided">Voided</option>
            </select>
          </label>

          <label>
            <span>Method</span>
            <select
              value={method}
              onChange={event=>setMethod(event.target.value)}
            >
              <option value="">All methods</option>

              {methods.map(item=>(
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label className="payment-report-search">
            <span>Search</span>
            <input
              value={query}
              onChange={event=>setQuery(event.target.value)}
              placeholder="Student, team, receipt or reference"
            />
          </label>

        </div>
      </section>

      <section className="payment-report-summary">

        <article className="payment-summary-card paid">
          <span>Collected</span>
          <strong>{money(summary.paid_total)}</strong>
          <small>{summary.paid_count} paid payments</small>
        </article>

        <article className="payment-summary-card pending">
          <span>Pending</span>
          <strong>{money(summary.pending_total)}</strong>
          <small>{summary.pending_count} pending payments</small>
        </article>

        <article className="payment-summary-card">
          <span>Cash</span>
          <strong>
            {money(summary.method_totals?.Cash?.amount || 0)}
          </strong>
          <small>
            {summary.method_totals?.Cash?.count || 0} payments
          </small>
        </article>

        <article className="payment-summary-card">
          <span>Coordinator UPI</span>
          <strong>
            {money(
              summary.method_totals?.['Coordinator UPI']?.amount || 0
            )}
          </strong>
          <small>
            {summary.method_totals?.['Coordinator UPI']?.count || 0} payments
          </small>
        </article>

        <article className="payment-summary-card">
          <span>Online</span>
          <strong>
            {money(summary.method_totals?.Razorpay?.amount || 0)}
          </strong>
          <small>
            {summary.method_totals?.Razorpay?.count || 0} Razorpay payments
          </small>
        </article>

        <article className="payment-summary-card exception">
          <span>Exceptions</span>
          <strong>
            {summary.failed_count +
             summary.refunded_count +
             summary.voided_count}
          </strong>
          <small>
            Failed / Refunded / Voided
          </small>
        </article>

      </section>

      <section className="panel">
        <div className="section-mini-head">
          <div>
            <span className="eyebrow">
              Reconciliation records
            </span>
            <h3>Payment Ledger</h3>
          </div>

          <span className="count-badge">
            {filteredRows.length}
          </span>
        </div>

        {!eventId ? (
          <div className="empty-state compact">
            <h3>Select an event</h3>
            <p>
              Choose a paid event to view its payment report.
            </p>
          </div>
        ) : loading ? (
          <div className="empty-state compact">
            <h3>Loading payment records...</h3>
          </div>
        ) : filteredRows.length===0 ? (
          <div className="empty-state compact">
            <h3>No payment records found for this event.</h3>
            <p>
              Try another event or clear the current filters.
            </p>
          </div>
        ) : (
          <div className="table-wrap payment-report-table-wrap">
            <table className="data-table payment-report-table">
              <thead>
                <tr>
                  <th>Participant</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Method</th>
                  <th>Reference</th>
                  <th>Collected By</th>
                  <th>Recorded</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {filteredRows.map(row=>(
                  <tr key={row.id}>
                    <td>
                      <strong>{participant(row)}</strong>
                      <small>{participantDetail(row)}</small>
                    </td>

                    <td>
                      <strong>{money(row.amount)}</strong>
                      <small>
                        Registration #{row.registration_id || '-'}
                      </small>
                    </td>

                    <td>
                      <span
                        className={`payment-report-status status-${row.status.toLowerCase()}`}
                      >
                        {row.status}
                      </span>
                    </td>

                    <td>{row.method || '-'}</td>

                    <td>
                      <strong>
                        {row.provider_reference ||
                         row.receipt_no ||
                         '-'}
                      </strong>

                      {row.receipt_no &&
                       row.provider_reference && (
                        <small>
                          Receipt: {row.receipt_no}
                        </small>
                      )}
                    </td>

                    <td>{row.collector_name || 'System / Online'}</td>

                    <td>{formatDate(row.created_at)}</td>

                    <td>
                      {row.status==='Pending' && user?.role !== 'HOD' ? (
                        <button
                          type="button"
                          className="button payment-verify-button"
                          onClick={()=>openVerify(row)}
                        >
                          Verify Payment
                        </button>
                      ) : (
                        <span className="payment-verified-label">
                          {row.status}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {verifyRow && (
        <div
          className="payment-verify-overlay"
          role="presentation"
          onMouseDown={event=>{
            if(event.target===event.currentTarget && !verifying){
              setVerifyRow(null)
            }
          }}
        >
          <section
            className="payment-verify-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-verify-title"
          >
            <div className="payment-verify-modal-head">
              <div>
                <span className="eyebrow">Offline payment</span>
                <h3 id="payment-verify-title">Verify Payment</h3>
                <p>
                  Confirm payment only after the amount has actually
                  been received.
                </p>
              </div>

              <button
                type="button"
                className="payment-verify-close"
                aria-label="Close"
                disabled={verifying}
                onClick={()=>setVerifyRow(null)}
              >
                X
              </button>
            </div>

            <div className="payment-verify-summary">
              <div>
                <span>Participant</span>
                <strong>{participant(verifyRow)}</strong>
              </div>

              <div>
                <span>Amount</span>
                <strong>{money(verifyRow.amount)}</strong>
              </div>

              <div>
                <span>Registration</span>
                <strong>#{verifyRow.registration_id || '-'}</strong>
              </div>
            </div>

            <div className="payment-verify-form">
              <label>
                <span>Payment Method *</span>
                <select
                  value={verifyMethod}
                  onChange={event=>{
                    setVerifyMethod(event.target.value)
                    if(event.target.value==='Cash'){
                      setVerifyReference('')
                    }
                  }}
                  disabled={verifying}
                >
                  <option value="Cash">Cash</option>
                  <option value="Coordinator UPI">
                    Coordinator UPI
                  </option>
                </select>
              </label>

              {verifyMethod==='Coordinator UPI' && (
                <label>
                  <span>UPI Transaction / Reference ID *</span>
                  <input
                    value={verifyReference}
                    onChange={event=>setVerifyReference(event.target.value)}
                    placeholder="Enter transaction/reference ID"
                    disabled={verifying}
                  />
                </label>
              )}

              <label>
                <span>Receipt Number</span>
                <input
                  value={verifyReceipt}
                  onChange={event=>setVerifyReceipt(event.target.value)}
                  placeholder="Optional receipt number"
                  disabled={verifying}
                />
              </label>

              <label>
                <span>Notes</span>
                <textarea
                  value={verifyNotes}
                  onChange={event=>setVerifyNotes(event.target.value)}
                  placeholder="Optional payment note"
                  rows={3}
                  disabled={verifying}
                />
              </label>
            </div>

            <div className="payment-verify-warning">
              Verifying this payment will mark it as Paid and confirm
              the linked event registration.
            </div>

            <div className="payment-verify-actions">
              <button
                type="button"
                className="button"
                disabled={verifying}
                onClick={()=>setVerifyRow(null)}
              >
                Cancel
              </button>

              <button
                type="button"
                className="button button-primary"
                disabled={
                  verifying ||
                  (
                    verifyMethod==='Coordinator UPI' &&
                    !verifyReference.trim()
                  )
                }
                onClick={verifyPayment}
              >
                {verifying ? 'Verifying...' : 'Confirm Payment'}
              </button>
            </div>
          </section>
        </div>
      )}

    </div>
  )
}



