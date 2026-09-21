import { Component, type ErrorInfo, type ReactNode } from 'react'
import { appPath } from '../lib/paths'
export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('EventHub page error', error, info.componentStack) }
  render() {
    if (this.state.failed) return <main className="recovery-page" role="alert"><h1>This page could not open.</h1><p>Please reload the page. If the problem continues, contact your EventHub administrator.</p><button className="button button-primary" onClick={() => window.location.reload()}>Reload page</button><a href={appPath('/')}>Return home</a></main>
    return this.props.children
  }
}
