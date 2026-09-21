import ThemeToggle from '../components/ThemeToggle'
import { Link } from 'react-router-dom'
export default function NotFoundPage(){return <main className="not-found"><div className="standalone-theme"><ThemeToggle/></div><h1>404</h1><p>This page does not exist.</p><Link className="button button-primary" to="/">Back Home</Link></main>}
