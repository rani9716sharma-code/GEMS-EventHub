import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import Brand from '../components/Brand'
import ThemeToggle from '../components/ThemeToggle'
import { homeForRole, useAuth } from '../auth/AuthContext'

const links = [['/', 'Home'], ['/events', 'Events'], ['/gallery', 'Gallery'], ['/results', 'Results'], ['/verify', 'Certificates'], ['/contact', 'Help']]

export default function PublicLayout() {
  const { pathname } = useLocation()
  const { user } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  useEffect(() => {
    setMenuOpen(false)
    document.title = `${links.find(([path]) => path === pathname)?.[1] || (pathname === '/login' ? 'Sign In' : 'EventHub')} | GEMS EventHub`
    window.scrollTo(0, 0)
  }, [pathname])
  return <div className="app-shell public-shell">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className="public-header">
      <div className="container header-inner">
        <div className="public-brand-link"><Brand /></div>
        <nav id="public-navigation" className={`public-nav ${menuOpen ? 'is-open' : ''}`} aria-label="Main navigation">
          {links.map(([href, label]) => <NavLink key={href} to={href} end={href === '/'} className={({ isActive }) => `public-nav-link${isActive ? ' active' : ''}`}>{label}</NavLink>)}
        </nav>
        <div className="public-header-actions">
          <ThemeToggle />
          <Link className="public-signin-button" to={user ? homeForRole(user.role) : '/login'}>{user ? 'My Portal' : 'Sign In'}</Link>
          <button className="public-menu-toggle" type="button" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-controls="public-navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)} onKeyDown={e => { if (e.key === 'Escape') setMenuOpen(false) }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d={menuOpen ? 'M6 6l12 12M6 18L18 6' : 'M4 6h16M4 12h16M4 18h16'} /></svg>
          </button>
        </div>
      </div>
    </header>
    <div id="main-content" tabIndex={-1}><Outlet /></div>
    <footer className="public-footer">
      <div className="container footer-grid">
        <div className="footer-about">
          <Brand />
          <p>Discover, register for, manage and celebrate every college event in one place.</p>
        </div>
        <nav className="footer-col" aria-label="EventHub">
          <h2>EventHub</h2>
          <Link to="/events">Upcoming events</Link>
          <Link to="/gallery">Gallery</Link>
          <Link to="/results">Results</Link>
        </nav>
        <nav className="footer-col" aria-label="Help">
          <h2>Help</h2>
          <Link to="/verify">Verify a certificate</Link>
          <Link to="/contact">Help &amp; support</Link>
          <Link to="/login">Sign in</Link>
        </nav>
      </div>
      <div className="footer-base">
        <div className="container footer-base-inner">
          <span>© 2026 GEMS EventHub</span>
        </div>
      </div>
    </footer>
  </div>
}
