// Starts the EventHub server (website + API + database) after checking the basics.
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { requireNode, loadDotEnv } from './preflight.mjs'

requireNode()
await loadDotEnv()
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
if (!existsSync(join(root, 'dist', 'index.html'))) {
  console.warn('\nNote: the website has not been built yet (dist/ is missing), so only the API will respond.')
  console.warn('Run "npm run build" first, or use "npm run dev" for development.\n')
}
await import('../server/index.mjs')
