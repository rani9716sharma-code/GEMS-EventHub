import ThemeToggle from '../components/ThemeToggle'
import { Link } from 'react-router-dom'
import { homeForRole, useAuth } from '../auth/AuthContext'
export default function ForbiddenPage(){
  const { user } = useAuth()
  return <main className="not-found"><div className="standalone-theme"><ThemeToggle/></div><span className="eyebrow">Access restricted</span><h1>403</h1><h2>This page isn't available for your role.</h2><p className="muted">EventHub only shows the tools you are authorized to use.</p>{user && <Link className="button button-primary" to={homeForRole(user.role)}>Back to my portal</Link>}</main>
}
