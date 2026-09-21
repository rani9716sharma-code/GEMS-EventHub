import { FormEvent, useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import Brand from '../components/Brand'
import { API, useAuth, type AuthUser } from '../auth/AuthContext'
import ThemeToggle from '../components/ThemeToggle'

type MenuItem=[string,string,string]
export default function PortalLayout(){
  const { user } = useAuth()
  return user ? <AuthenticatedPortal user={user} /> : null
}
function AuthenticatedPortal({ user }: { user: AuthUser }) {
  const {token,logout}=useAuth();const navigate=useNavigate();const location=useLocation();const [mobileOpen,setMobileOpen]=useState(false);const [search,setSearch]=useState('');const [unread,setUnread]=useState(0)
  const menu:MenuItem[]=user.role==='Super Admin'?[['Overview','/admin','OV'],['Events','/admin/events','EV'],['Students','/admin/students','ST'],['Registrations','/admin/registrations','REG'],['Users & Roles','/admin/users','USR'],['Departments','/admin/departments','DEP'],['Library','/admin/library','LIB'],['Gallery','/admin/gallery','G'],['Venues','/admin/venues','VEN'],['Calendar','/admin/calendar','CAL'],['Reports','/admin/reports','REP'],['Rankings','/admin/rankings','RANK'],['Audit Logs','/admin/audit','AUD'],['Notifications','/admin/notifications','N'],['Settings','/admin/settings','SET'],['Google Sheets','/admin/sheets','GS'],['Public Website','/events','WEB']]:user.role==='HOD'?[['Overview','/hod','OV'],['Approvals','/hod/approvals','APP'],['Calendar','/hod/calendar','CAL'],['Reports','/hod/reports','REP'],['Notifications','/hod/notifications','N'],['Public Events','/events','WEB']]:user.role==='Main Coordinator'||user.role==='Department Coordinator'||user.role==='Librarian'?[['Overview','/coordinator','OV'],['My Events','/coordinator/events','EV'],['Create Event','/coordinator/events/create','NEW'],['Teams','/coordinator/teams','T'],['Students','/coordinator/students','ST'],['ID Scanner','/coordinator/scanner','ID'],['Communication','/coordinator/notifications','MSG'],['Inbox','/coordinator/inbox','N'],['Reports','/coordinator/reports','REP'],['Public Events','/events','WEB']]:[['Home','/student','HOME'],['Explore Events','/student/explore','EV'],['My Registrations','/student/registrations','REG'],['Payments','/student/payments','PAY'],['My Teams','/student/teams','T'],['Results','/student/results','R'],['Certificates','/student/certificates','CERT'],['Rankings','/student/rankings','RANK'],['Activity Portfolio','/student/activity','ACT'],['Notifications','/student/notifications','N'],['My Profile','/student/profile','ME']]
  const base=user.role==='Super Admin'?'/admin':user.role==='HOD'?'/hod':user.role==='Student'?'/student':'/coordinator';const notificationHref=user.role==='Student'?'/student/notifications':user.role==='Super Admin'?'/admin/notifications':user.role==='HOD'?'/hod/notifications':'/coordinator/inbox'
  useEffect(()=>{setMobileOpen(false)},[location.pathname])
  useEffect(() => {
    if (!mobileOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') { setMobileOpen(false); document.querySelector<HTMLButtonElement>('.mobile-menu-button')?.focus() } }
    document.addEventListener('keydown', close)
    return () => { document.body.style.overflow = previous; document.removeEventListener('keydown', close) }
  }, [mobileOpen])
  useEffect(()=>{
    if(!token) return

    let active = true

    async function refreshUnread(){
      try{
        const r = await fetch(
          `${API}/api/notifications`,
          {
            headers:{
              Authorization:`Bearer ${token}`
            },
            cache:'no-store'
          }
        )

        if(!r.ok || !active) return

        const d = await r.json()

        if(active){
          setUnread(
            (d.rows || []).filter(
              (n:any)=>!n.read_at
            ).length
          )
        }

      }catch{}
    }

    refreshUnread()

    // Update automatically without page reload.
    const timer = window.setInterval(
      refreshUnread,
      3000
    )

    const onFocus = () => refreshUnread()

    const onVisibility = () => {
      if(document.visibilityState === 'visible'){
        refreshUnread()
      }
    }

    const onNotificationChanged = () => {
      refreshUnread()
    }

    window.addEventListener(
      'focus',
      onFocus
    )

    window.addEventListener(
      'eventhub:notifications-changed',
      onNotificationChanged
    )

    document.addEventListener(
      'visibilitychange',
      onVisibility
    )

    return ()=>{
      active = false

      window.clearInterval(timer)

      window.removeEventListener(
        'focus',
        onFocus
      )

      window.removeEventListener(
        'eventhub:notifications-changed',
        onNotificationChanged
      )

      document.removeEventListener(
        'visibilitychange',
        onVisibility
      )
    }

  },[token,location.pathname])
  const pageTitle=useMemo(()=>menu.find(([,href])=>href===location.pathname)?.[0]||menu.find(([,href])=>href!==base&&location.pathname.startsWith(href))?.[0]||'EventHub',[menu,location.pathname])
  useEffect(() => { document.title = `${pageTitle} | GEMS EventHub` }, [pageTitle])
  async function signOut(){await logout();navigate('/login',{replace:true})}
  function submitSearch(e: FormEvent) {
    e.preventDefault()

    const q = search.trim().toLowerCase()
    if (!q) return

    const hit = menu.find(([label]) =>
      label.toLowerCase().includes(q)
    )

    if (hit) {
      navigate(hit[1])
      setSearch('')
    }
  }

  const searchResults = search.trim()
    ? menu
        .filter(([label]) =>
          label.toLowerCase().includes(search.trim().toLowerCase())
        )
        .slice(0, 8)
    : []
  return <div className="portal-shell modern-shell" data-role={user.role}><a className="skip-link" href="#portal-content">Skip to content</a>
    {mobileOpen&&<button className="sidebar-scrim" aria-label="Close navigation" onClick={()=>setMobileOpen(false)}/>}<aside className={`portal-sidebar modern-sidebar ${mobileOpen?'open':''}`}><div className="sidebar-brand-row"><Brand/><button className="sidebar-close" aria-label="Close navigation" onClick={()=>setMobileOpen(false)}>X</button></div><div className="role-badge modern-role"><span className="role-pulse"/><div><b>{user.role}</b><small>{user.department||'College Administration'}</small></div></div><nav id="portal-navigation" aria-label="Portal navigation">{menu.map(([label,href,icon],index)=><div className="nav-wrap" key={href}>{(index===0||index===5||index===10)&&<small className="nav-section-label">{index===0?'WORKSPACE':index===5?'MANAGEMENT':'SYSTEM'}</small>}<NavLink to={href} end={href===base}><span>{label}</span>{label==='Notifications'&&unread>0&&<em>{unread>9?'9+':unread}</em>}</NavLink></div>)}</nav><div className="sidebar-user"><div className="profile-dot">{user.name.slice(0,1).toUpperCase()}</div><div><b>{user.name}</b><small>{user.role}</small></div><button
  type="button"
  className="sidebar-signout-button"
  onClick={signOut}
  title="Sign out"
  aria-label="Sign out"
>
  <svg
    className="sidebar-signout-svg"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path
      d="M10 17l5-5-5-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M15 12H4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
    <path
      d="M13 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>

  <span>Sign Out</span>
</button></div></aside>
    <main className="portal-main modern-main"><header className="portal-topbar modern-topbar"><div className="topbar-left"><button className="mobile-menu-button" aria-label="Open navigation" aria-expanded={mobileOpen} aria-controls="portal-navigation" onClick={()=>setMobileOpen(true)}>Menu</button><div className="breadcrumb"><small>GEMS EVENTHUB / {user.role.toUpperCase()}</small><h1>{pageTitle}</h1></div></div><div className="global-search-wrap">
  <form className="global-search" onSubmit={submitSearch}>
    

    <input
      value={search}
      onChange={(e) => setSearch(e.target.value)}
      placeholder="Search modules..."
      aria-label="Search modules"
      onKeyDown={e => { if (e.key === 'Escape') setSearch('') }}
      autoComplete="off"
    />

    <kbd>Enter</kbd>
  </form>

  {searchResults.length > 0 && (
    <div className="global-search-results">
      {searchResults.map(([label, href, icon]) => (
        <button
          key={href}
          type="button"
          onClick={() => {
            navigate(href)
            setSearch('')
          }}
        >
          <span>{icon}</span>
          <strong>{label}</strong>
        </button>
      ))}
    </div>
  )}

  {search.trim() && searchResults.length === 0 && (
    <div className="global-search-results">
      <div className="global-search-empty">
        No matching module
      </div>
    </div>
  )}
</div><div className="topbar-actions"><ThemeToggle/><NavLink
  to={notificationHref}
  className="top-icon notification-button"
  title="Notifications"
  aria-label={
    unread > 0
      ? `${unread} unread notifications`
      : 'Notifications'
  }
>
  <svg
    className="eventhub-bell-icon"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path
      d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M10 21h4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>

  {unread>0 && (
    <b>
      {unread>9?'9+':unread}
    </b>
  )}
</NavLink><div className="top-profile"><div className="profile-dot">{user.name.slice(0,1).toUpperCase()}</div><div><b>{user.name}</b><small>{user.department||user.role}</small></div></div></div></header><div id="portal-content" tabIndex={-1}><Outlet/></div></main>
  </div>
}



