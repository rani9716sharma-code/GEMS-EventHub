import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react'
import { API, ApiError, apiRequest } from '../lib/api'

export type UserRole = 'Super Admin' | 'HOD' | 'Main Coordinator' | 'Department Coordinator' | 'Librarian' | 'Student'
export type AuthUser = {
  id: number
  name: string
  email: string | null
  college_id: string | null
  role: UserRole
  department: string | null
  student_id: string | null
  active: boolean
}

type AuthValue = {
  user: AuthUser | null
  token: string | null
  loading: boolean
  sessionError: string
  retrySession: () => void
  login: (identifier: string, password: string) => Promise<AuthUser>
  logout: () => Promise<void>
  setSession: (token: string, user: AuthUser) => void
}

const AuthContext = createContext<AuthValue | null>(null)
const TOKEN_KEY = 'gemsEventHubAuthToken'
function readToken() { try { return sessionStorage.getItem(TOKEN_KEY) } catch { return null } }
function storeToken(value: string | null) { try { value ? sessionStorage.setItem(TOKEN_KEY, value) : sessionStorage.removeItem(TOKEN_KEY) } catch { /* In-memory sign-in remains available. */ } }

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(readToken)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [sessionError, setSessionError] = useState('')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!token) { setUser(null); setSessionError(''); setLoading(false); return }
      setLoading(true)
      setSessionError('')
      try {
        const data = await apiRequest('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
        if (!cancelled) setUser(data.user)
      } catch (error) {
        if (cancelled) return
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          storeToken(null); setToken(null); setUser(null)
        } else { setSessionError(error instanceof Error ? error.message : 'Could not check your session.') }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [token, retry])

  function setSession(nextToken: string, nextUser: AuthUser) {
    storeToken(nextToken)
    setToken(nextToken)
    setUser(nextUser)
    setLoading(false)
    setSessionError('')
  }

  async function login(identifier: string, password: string) {
    const data = await apiRequest('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password }),
    })
    setSession(data.token, data.user)
    return data.user as AuthUser
  }

  async function logout() {
    // Clear the local session immediately, even if the network is unavailable.
    storeToken(null)
    setToken(null)
    setUser(null)
    setSessionError('')
    if (token) {
      void apiRequest('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => undefined)
    }
  }

  const value = useMemo(() => ({ user, token, loading, sessionError, retrySession: () => setRetry(n => n + 1), login, logout, setSession }), [user, token, loading, sessionError])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}

export function homeForRole(role: UserRole) {
  if (role === 'Super Admin') return '/admin'
  if (role === 'HOD') return '/hod'
  if (role === 'Main Coordinator' || role === 'Department Coordinator' || role === 'Librarian') return '/coordinator'
  return '/student'
}

export { API }
