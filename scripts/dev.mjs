import { spawn } from 'node:child_process'
import { requireNode, loadDotEnv } from './preflight.mjs'

requireNode()
await loadDotEnv()

const children = []

function run(command, args) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: false,
    env: process.env,
  })

  children.push(child)

  child.on('error', (error) => {
    console.error(`Failed to start ${command}:`, error.message)
    process.exitCode = 1
  })

  child.on('exit', (code) => {
    if (code && code !== 0) process.exitCode = code
  })
}

// API: run directly with the same Node.js executable on every platform.
run(process.execPath, ['--watch', 'server/index.mjs'])

// Web: when this script is started by `npm run dev`, npm exposes the exact
// npm CLI entry file in npm_execpath. Running that file with Node avoids the
// Windows `npm`/`npm.cmd` spawn difference and works on macOS/Linux as well.
const npmCli = process.env.npm_execpath

if (npmCli) {
  run(process.execPath, [npmCli, 'run', 'dev:web'])
} else if (process.platform === 'win32') {
  // Fallback for direct `node scripts/dev.mjs` execution on Windows.
  const comspec = process.env.ComSpec || 'cmd.exe'
  run(comspec, ['/d', '/s', '/c', 'npm.cmd run dev:web'])
} else {
  run('npm', ['run', 'dev:web'])
}

function shutdown() {
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM')
  }
  setTimeout(() => process.exit(0), 200)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
