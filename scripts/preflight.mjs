// Shared start-up checks so problems are explained in plain words instead of stack traces.
export function requireNode() {
  const [major, minor] = process.versions.node.split('.').map(Number)
  if (major > 22 || (major === 22 && minor >= 18)) return
  console.error(`\nEventHub needs Node.js 22.18 or newer, but this computer has ${process.version}.`)
  console.error('Install the current LTS version from https://nodejs.org (or run: nvm install 22) and try again.\n')
  process.exit(1)
}

// Lets you keep settings (port, Google Sheets, Razorpay...) in a file named ".env" next to package.json.
export async function loadDotEnv() {
  const { existsSync } = await import('node:fs')
  if (existsSync('.env') && typeof process.loadEnvFile === 'function') {
    try { process.loadEnvFile('.env') } catch (error) { console.warn(`Could not read .env: ${error.message}`) }
  }
}
