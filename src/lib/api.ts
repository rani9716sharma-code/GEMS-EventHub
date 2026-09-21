/** Use the site's origin unless a separate API origin is explicitly configured. */
export const API = String(import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '')

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message) }
}

export async function apiRequest<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 20000)
  const headers = new Headers(options.headers)
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  try {
    const response = await fetch(`${API}${path}`, { ...options, headers, signal: options.signal || controller.signal })
    const data = await response.json().catch(() => null)
    if (!response.ok) throw new ApiError(data?.error || `Request failed (${response.status}). Please try again.`, response.status)
    if (data === null) throw new ApiError('The server returned an unexpected response. Please try again.', response.status)
    return data as T
  } catch (error) {
    if (error instanceof ApiError || options.signal?.aborted) throw error
    throw new ApiError('Cannot reach EventHub. Check your connection and try again.', 0)
  } finally { window.clearTimeout(timeout) }
}
