import { useCallback, useEffect, useState } from 'react'
import { apiRequest } from '../lib/api'
export function useResource<T>(path: string, token?: string | null) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  const reload = useCallback(() => setRevision(n => n + 1), [])
  useEffect(() => {
    let active = true
    setLoading(true); setError(''); setData(null)
    apiRequest<T>(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(value => { if (active) setData(value) })
      .catch(err => { if (active) setError(err.message || 'Could not load this page.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [path, token, revision])
  return { data, error, loading, reload }
}
