import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { UserRole, useAuth } from './AuthContext'

export default function RequireAuth({ roles }: { roles: UserRole[] }) {
  const { user, loading, sessionError, retrySession, logout } = useAuth()
  const location = useLocation()
  if (loading) return <div className="auth-loading"><div className="spinner"/><span>Loading your EventHub...</span></div>
  if (!user && sessionError) return <main className="recovery-page" role="alert"><h1>Unable to connect</h1><p>{sessionError}</p><button className="button button-primary" onClick={retrySession}>Try again</button><button className="button button-ghost" onClick={() => void logout()}>Return to sign in</button></main>
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!roles.includes(user.role)) return <Navigate to="/forbidden" replace />
  return <Outlet />
}
