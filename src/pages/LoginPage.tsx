import { FormEvent, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { API, homeForRole, useAuth } from '../auth/AuthContext'
import { assetUrl } from '../lib/paths'

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false)
  const { login, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  const [setupRequired,setSetupRequired]=useState(false)

  useEffect(()=>{
    if(user) { const home=homeForRole(user.role); const from=location.state?.from; navigate(typeof from==='string' && (from===home || from.startsWith(`${home}/`)) ? from : home,{replace:true}) }
    fetch(`${API}/api/setup/status`).then(r=>r.json()).then(d=>setSetupRequired(Boolean(d.setup_required))).catch(()=>{})
  },[user,navigate,location.state])

  async function submit(e: FormEvent<HTMLFormElement>) {
    if (busy) { e.preventDefault(); return }
    e.preventDefault(); setError(''); setBusy(true)
    const form = new FormData(e.currentTarget)
    try { const next=await login(String(form.get('identifier')||''),String(form.get('password')||'')); const home=homeForRole(next.role); const from=location.state?.from; navigate(typeof from==='string' && (from===home || from.startsWith(`${home}/`)) ? from : home,{replace:true}) }
    catch(err){setError(err instanceof Error?err.message:'Sign in failed.')}
    finally{setBusy(false)}
  }

  return (
    <main className="login-page branded-login">
      <section className="login-panel login-art" aria-label="GEMS Polytechnic College campus">
        <img className="login-art-photo" src={assetUrl('/images/gems-campus.png')} alt="" />
        <div className="login-art-overlay" />
        <div className="login-art-content">
          <span className="eyebrow light">GEMS Polytechnic College</span>
          <h1>Events that bring GEMS together.</h1>
          <p className="login-tagline">Discover. Participate. Achieve.</p>
          <ul className="login-feature-strip">
            <li><b>Explore</b><small>Technical, cultural, sports and workshops</small></li>
            <li><b>Register easily</b><small>Use your existing Student ID</small></li>
            <li><b>Pay your way</b><small>Online, or at the coordinator desk</small></li>
            <li><b>Earn certificates</b><small>Build a verifiable achievement record</small></li>
          </ul>
        </div>
      </section>
      <section className="login-panel login-form-panel">
        <form className="login-card" onSubmit={submit}>
          <div className="login-card-brand"><img src={assetUrl('/assets/gems-logo.png')} alt="GEMS Polytechnic College" /></div><span className="eyebrow">Secure portal</span><h2>Sign in to GEMS EventHub</h2><p className="muted">One sign-in. EventHub automatically opens the correct portal for your role.</p>
          {setupRequired&&<div className="form-alert info">This EventHub installation needs its first administrator. <button type="button" className="inline-link" onClick={()=>navigate('/setup')}>Complete setup</button></div>}
          {error&&<div className="form-alert error" role="alert">{error}</div>}
          <label>College ID / Email<input name="identifier" required placeholder="Enter your College ID or email" autoComplete="username" /></label>
          <label>
  Password
  <div className="password-input-wrap">
    <input
      name="password"
      required
      type={showPassword ? "text" : "password"}
      placeholder="Enter your password"
      autoComplete="current-password"
    />
    <button
      type="button"
      className="password-show-button"
      onClick={() => setShowPassword((value) => !value)}
      aria-label={showPassword ? "Hide password" : "Show password"}
    >
      {showPassword ? "Hide" : "Show"}
    </button>
  </div>
</label>
          <button className="button button-primary button-full login-submit" type="submit" disabled={busy}>{busy?'Signing in...':'Sign In'}</button>
          <Link className="text-button" to="/contact">Need an account or forgot your password? Contact your administrator.</Link>
          <div className="login-note"><b>No portal selection required.</b><br/>Your account role controls what you can see and manage.</div>
        </form>
      </section>
    </main>
  )
}
