// Apply before the first paint to avoid a bright flash for dark-mode users.
try {
  const saved = localStorage.getItem('eventhubTheme') || localStorage.getItem('eventhubPublicTheme')
  const theme = saved === 'light' || saved === 'dark' ? saved : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  document.documentElement.dataset.theme = theme
  document.documentElement.dataset.publicTheme = theme
  document.documentElement.style.colorScheme = theme
} catch { /* The React provider handles browsers with restricted storage. */ }
