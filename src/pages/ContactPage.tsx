import { Link } from 'react-router-dom'
import { useResource } from '../hooks/useResource'
export default function ContactPage() {
  const { data } = useResource<{ support_email?: string; support_phone?: string }>('/api/public/support')
  const email = data?.support_email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.support_email) ? data.support_email : ''
  const phone = data?.support_phone || ''
  return <main className="public-section"><span className="eyebrow">Help & support</span><h1>How can we help?</h1><p className="lead">Your college administrator and event coordinator can help you use EventHub.</p><div className="support-grid"><section className="support-card"><h2>Account & sign-in</h2><p>Ask your college EventHub administrator to create your student account or reset your password. Have your College ID ready.</p>{email && <a className="button button-primary" href={`mailto:${email}`}>Email administrator</a>}{phone && <p>Support phone: <a href={`tel:${phone.replace(/[^+\d]/g, '')}`}>{phone}</a></p>}{!email && !phone && <p className="muted">Contact your department office for the administrator's contact details.</p>}</section><section className="support-card"><h2>Events & payments</h2><p>For eligibility, registrations, offline payments or attendance corrections, contact the coordinator for your event. Include the event name and your registration ID.</p><Link className="button button-ghost" to="/events">Find your event</Link></section></div><p className="helper-text">Never share your password or one-time payment code with anyone.</p></main>
}
