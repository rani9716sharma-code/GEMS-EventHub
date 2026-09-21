import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
export default function HodDashboard(){
  const { user } = useAuth()
  return <section className="portal-content">
    <div className="portal-hero-card"><div><span className="eyebrow light">Department approval portal</span><h2>{user?.department || 'Department'} events, without the clutter.</h2><p>Review event requests, monitor department participation and access reports. Review submitted events, request changes when needed, approve valid proposals and keep a clean department record.</p></div></div>
    <div className="quick-grid"><article><b>Approval Requests</b><strong>Active</strong><span>Coordinator → HOD workflow</span><Link className="button button-primary button-small" to="/hod/approvals" style={{marginTop:12}}>Open Approvals</Link></article><article><b>Department Events</b><strong>Focused</strong><span>Only your department records</span></article><article><b>Reports</b><strong>Simple</strong><span>Attendance and participation</span></article></div>
  </section>
}
