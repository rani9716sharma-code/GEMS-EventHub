import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

type Theme = 'light' | 'dark'
const KEY = 'eventhubTheme'
const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void } | null>(null)
function preference(): Theme | null {
  try {
    const value = localStorage.getItem(KEY) || localStorage.getItem('eventhubPublicTheme')
    return value === 'light' || value === 'dark' ? value : null
  } catch { return null }
}
function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme
  // Compatibility with the original public-page styles.
  document.documentElement.dataset.publicTheme = theme
  document.documentElement.style.colorScheme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0c1525' : '#f5f7fb')
}
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => preference() || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'))
  useEffect(() => { apply(theme) }, [theme])
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const sync = () => setTheme(preference() || (media.matches ? 'dark' : 'light'))
    window.addEventListener('storage', sync)
    media.addEventListener('change', sync)
    return () => { window.removeEventListener('storage', sync); media.removeEventListener('change', sync) }
  }, [])
  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    try { localStorage.setItem(KEY, next); localStorage.setItem('eventhubPublicTheme', next) } catch { /* Still work when storage is unavailable. */ }
    apply(next)
    setTheme(next)
  }
  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>
}
export function useTheme() {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('ThemeProvider is missing.')
  return value
}
