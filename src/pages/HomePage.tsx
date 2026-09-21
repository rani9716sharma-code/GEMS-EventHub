import { Link } from 'react-router-dom'
import EventCard from '../components/EventCard'
import { useResource } from '../hooks/useResource'
import LoadState from '../components/LoadState'
import { API } from '../lib/api'
import { assetUrl } from '../lib/paths'

const steps = [
  { title: 'Plan', who: 'Coordinators & HODs', text: 'Coordinators create an event; the department head reviews and approves it.' },
  { title: 'Register', who: 'Students', text: 'Sign up alone or as a team, if you are eligible for the event.' },
  { title: 'Pay', who: 'Students & coordinators', text: 'Pay online, or at the coordinator desk for offline payments.' },
  { title: 'Attend', who: 'Everyone', text: 'Check in quickly with your college ID card at the venue.' },
  { title: 'Celebrate', who: 'Participants', text: 'See published results and rankings, and download verifiable certificates.' },
]

const departments = [
  { code: 'CSE', name: 'Computer Science & Engineering' },
  { code: 'Civil', name: 'Civil Engineering' },
  { code: 'Mechanical', name: 'Mechanical Engineering' },
  { code: 'Electrical', name: 'Electrical Engineering' },
  { code: 'EEE', name: 'Electrical & Electronics Engineering' },
]

export default function HomePage() {
  const events = useResource<{ rows: any[] }>('/api/public/events')
  const stats = useResource<{ events: number; registrations: number; certificates: number }>('/api/public/stats')
  const today = new Date().toLocaleDateString('en-CA')
  const publicRows = events.data?.rows ?? []
  const activeEvents = publicRows
    .filter(event => event.status === 'Ongoing' || event.event_date >= today)
    .sort((a, b) => (a.status === 'Ongoing' ? -1 : b.status === 'Ongoing' ? 1 : `${a.event_date} ${a.start_time || ''}`.localeCompare(`${b.event_date} ${b.start_time || ''}`)))
  const pastEvents = publicRows.filter(event => event.event_date < today || ['Completed','Results Published','Certificates Issued'].includes(event.status))

  return (
    <main className="gems-home">
      <section className="gems-hero" aria-labelledby="home-title">
        <img className="gems-hero-photo" src={assetUrl('/images/gems-campus.png')} alt="" />
        <div className="gems-hero-shade" />
        <div className="container gems-hero-layout">
          <div className="gems-hero-copy">
            <span className="gems-label">GEMS Polytechnic College</span>
            <h1 id="home-title">Every event at GEMS, in one place.</h1>
            <p>
              Register for technical fests, cultural nights, sports meets and workshops. Pay online,
              check in with your ID card, and collect certificates anyone can verify.
            </p>
            <div className="gems-actions">
              <Link to="/events" className="gems-btn-primary">Explore events</Link>
              <Link to="/login" className="gems-btn-secondary">Sign in to portal</Link>
            </div>
          </div>
        </div>
        <div className="container gems-stat-wrap">
          <dl className="gems-stat-card">
            <div><dt>Published events</dt><dd>{stats.data?.events ?? '–'}</dd></div>
            <div><dt>Departments</dt><dd>5</dd></div>
            <div><dt>Registrations</dt><dd>{stats.data?.registrations ?? '–'}</dd></div>
            <div><dt>Certificates issued</dt><dd>{stats.data?.certificates ?? '–'}</dd></div>
          </dl>
        </div>
      </section>

      <section className="section" aria-labelledby="flow-title">
        <div className="container">
          <div className="section-heading">
            <div>
              <span className="eyebrow">How it works</span>
              <h2 id="flow-title">From idea to certificate</h2>
            </div>
            <p className="section-lead">One connected workflow for students, coordinators, department heads and administrators.</p>
          </div>
          <ol className="gems-steps">
            {steps.map((step, index) => (
              <li key={step.title}>
                <span className="gems-step-number" aria-hidden="true">{index + 1}</span>
                <h3>{step.title}</h3>
                <small>{step.who}</small>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section section-soft" aria-labelledby="events-title">
        <div className="container">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Live & Scheduled</span>
              <h2 id="events-title">What is happening at GEMS</h2>
            </div>
            <Link className="text-link" to="/events">View all events</Link>
          </div>
          {activeEvents.length > 0 && <div className="event-grid">
            {activeEvents.slice(0, 3).map(event => <EventCard key={event.id} event={{ id: String(event.id), title: event.name, department: event.organizing_department, category: event.category, date: event.event_date, venue: event.venue, status: event.status, displayStatus: event.status === 'Ongoing' || event.event_date === today ? 'Ongoing' : 'Scheduled', feeLabel: event.payment_type === 'Paid' ? `₹${event.fee}` : 'Free', accent: 'linear-gradient(135deg,#12306b,#0a6fb1)', poster: event.poster_url ? `${API}${event.poster_url}` : null }} />)}
          </div>}
          <LoadState loading={events.loading} error={events.error} retry={events.reload} />
          {!events.loading && !events.error && activeEvents.length === 0 && <div className="empty-state"><h3>New events will be scheduled soon</h3><p>There is no ongoing or scheduled event right now.</p>{pastEvents.length > 0 && <Link className="button button-primary" to="/events?view=past">Explore past events</Link>}</div>}
          {!events.loading && !events.error && activeEvents.length > 0 && pastEvents.length > 0 && <div style={{marginTop:'18px'}}><Link className="text-link" to="/events?view=past">Explore past events →</Link></div>}
        </div>
      </section>

      <section className="section" aria-labelledby="dept-title">
        <div className="container">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Departments</span>
              <h2 id="dept-title">Find events by department</h2>
            </div>
          </div>
          <div className="gems-dept-grid">
            {departments.map(d => (
              <Link key={d.code} to={`/events?department=${encodeURIComponent(d.code)}`} className="gems-dept-card">
                <span className="gems-dept-code">{d.code}</span>
                <span className="gems-dept-name">{d.name}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="gems-cta" aria-label="Get started">
        <div className="container gems-cta-inner">
          <div>
            <h2>Ready to take part?</h2>
            <p>Sign in with your College ID to register, pay, check in and collect your certificates.</p>
          </div>
          <Link className="button button-light" to="/login">Sign in to EventHub</Link>
        </div>
      </section>
    </main>
  )
}
