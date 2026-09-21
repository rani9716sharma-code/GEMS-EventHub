import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, resolve, sep } from 'node:path'

export function serveWeb(req, res, url, root) {
  if (!['GET', 'HEAD'].includes(req.method) || url.pathname.startsWith('/api/')) return false
  const dist = resolve(root, 'dist')
  if (!existsSync(join(dist, 'index.html'))) return false
  let name
  try { name = decodeURIComponent(url.pathname) } catch { res.writeHead(400); res.end(); return true }
  let file = resolve(dist, `.${name}`)
  if (file !== dist && !file.startsWith(dist + sep)) { res.writeHead(403); res.end(); return true }
  if (!existsSync(file) || !statSync(file).isFile()) {
    if (extname(name)) { res.writeHead(404); res.end('File not found'); return true }
    file = join(dist, 'index.html')
  }
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.json': 'application/json' }
  res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': file.includes(`${sep}assets${sep}`) && /-[\w-]{8,}\./.test(file) ? 'public, max-age=31536000, immutable' : 'no-cache' })
  if (req.method === 'HEAD') res.end()
  else createReadStream(file).on('error', () => res.destroy()).pipe(res)
  return true
}
