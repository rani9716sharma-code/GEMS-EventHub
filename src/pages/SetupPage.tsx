import ThemeToggle from '../components/ThemeToggle'
import { FormEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { API, homeForRole, useAuth } from '../auth/AuthContext'

export default function SetupPage() {
  const navigate = useNavigate()
  const { setSession } = useAuth()
  const [status, setStatus] = useState<'loading'|'needed'|'done'>('loading')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch(`${API}/api/setup/status`).then(r => r.json()).then(d => setStatus(d.setup_required ? 'needed' : 'done')).catch(() => setError('Could not reach the EventHub API.'))
  }, [])

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(''); setBusy(true)
    const form = new FormData(e.currentTarget)
    const password = String(form.get('password') || '')
    const confirm = String(form.get('confirm') || '')
    if (password !== confirm) { setError('Passwords do not match.'); setBusy(false); return }
    try {
      const res = await fetch(`${API}/api/setup/admin`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({
        name: form.get('name'), email: form.get('email'), college_id: form.get('college_id'), password
      }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Setup failed.')
      setSession(data.token, data.user)
      navigate(homeForRole(data.user.role), { replace:true })
    } catch (err) { setError(err instanceof Error ? err.message : 'Setup failed.') }
    finally { setBusy(false) }
  }

  if (status === 'loading' && error) return <main className="setup-page"><div className="standalone-theme"><ThemeToggle/></div><div className="setup-card" role="alert"><p>{error}</p><button className="button button-primary" onClick={()=>window.location.reload()}>Try again</button></div></main>
  if (status === 'loading') return <main className="setup-page"><div className="standalone-theme"><ThemeToggle/></div><div className="setup-card">Checking EventHub setup...</div></main>
  if (status === 'done') return <main className="setup-page"><div className="standalone-theme"><ThemeToggle/></div><div className="setup-card"><span className="eyebrow">Setup complete</span><h1>EventHub is already configured.</h1><p className="muted">Use the normal sign-in page to continue.</p><button className="button button-primary" onClick={() => navigate('/login')}>Go to Sign In</button></div></main>

  return <main className="setup-page"><div className="standalone-theme"><ThemeToggle/></div>
    <form className="setup-card" onSubmit={submit}>
      <span className="brand-mark login-brand-mark" aria-label="GEMS Polytechnic College">G</span>
      <span className="eyebrow">First run</span>
      <h1>Create the first Super Admin</h1>
      <p className="muted">This one-time screen closes permanently after the administrator is created.</p>
      {error && <div className="form-alert error">{error}</div>}
      <label>Administrator name<input name="name" required placeholder="Full name"/></label>
      <label>Official email<input name="email" type="email" required placeholder="admin@gems.edu"/></label>
      <label>College ID<input name="college_id" defaultValue="ADMIN-001" required/></label>
      <label>Password<input name="password" type="password" minLength={10} required placeholder="At least 10 characters"/></label>
      <label>Confirm password<input name="confirm" type="password" minLength={10} required/></label>
      <button className="button button-primary button-full" disabled={busy}>{busy ? 'Creating secure account...' : 'Create Super Admin'}</button>
    </form>
  </main>
}
