export type EventItem = {
  id: string
  title: string
  department: string
  category: string
  date: string
  venue: string
  feeLabel: string
  status: string
  accent: string
  poster?: string | null
  displayStatus?: string
}

function niceDate(value: string) {
  const d = new Date(`${value}T00:00:00`)
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function EventCard({ event }: { event: EventItem }) {
  return (
    <article className="event-card">
      <div className={`event-poster${event.poster ? ' has-image' : ''}`} style={{ background: event.accent }}>
        {event.poster && <><img className="event-poster-img" src={event.poster} alt="" loading="lazy" /><span className="event-poster-shade" /></>}
        <span className="event-chip">{event.category}</span>
        <div className="event-poster-copy">
          <small>{event.department}</small>
          <h3>{event.title}</h3>
        </div>
      </div>
      <div className="event-card-body">
        <div className="event-meta-grid">
          <span><b>Date</b>{niceDate(event.date)}</span>
          <span><b>Venue</b>{event.venue}</span>
        </div>
        <div className="event-card-footer">
          <span className={`status-pill ${event.displayStatus === 'Expired' ? 'gray' : 'green'}`}>{event.displayStatus || event.status}</span>
          <span className="fee-label">{event.feeLabel}</span>
        </div>
      </div>
    </article>
  )
}
