export default function LoadState({ loading, error, retry }: { loading: boolean; error: string; retry: () => void }) {
  if (loading) return <div className="empty-state" role="status"><div className="spinner"/><p>Loading EventHub records…</p></div>
  if (error) return <div className="form-alert error" role="alert"><p>{error}</p><button className="button button-ghost" onClick={retry}>Try again</button></div>
  return null
}
