// Локальный предпросмотр production-сборки с проксированием /api на coolay-backend.
// Используется только для проверки в песочнице: node scripts/preview-server.mjs
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const DIST = path.resolve(import.meta.dirname, '..', 'dist')
const PORT = Number(process.env.PORT || 4174)
const API_PORT = Number(process.env.API_PORT || 8821)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

function proxyApi(req, res) {
  const upstream = http.request(
    { host: '127.0.0.1', port: API_PORT, path: req.url, method: req.method, headers: req.headers },
    (up) => {
      res.writeHead(up.statusCode || 502, up.headers)
      up.pipe(res)
    },
  )
  upstream.on('error', (e) => {
    res.writeHead(502, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: false, error: `proxy: ${e.message}` }))
  })
  req.pipe(upstream)
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost')
    if (url.pathname.startsWith('/api/')) return proxyApi(req, res)

    let file = path.join(DIST, url.pathname)
    if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(DIST, 'index.html') // SPA fallback
    }
    const ext = path.extname(file)
    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
    })

    // NOFONTS=1 — вырезаем внешние Google Fonts: в офлайн-песочнице они
    // блокируют событие load и мешают автоматической проверке страниц.
    if (ext === '.html' && process.env.NOFONTS === '1') {
      const html = fs
        .readFileSync(file, 'utf8')
        .replace(/<link[^>]*fonts\.(googleapis|gstatic)\.com[^>]*>/g, '')
      return res.end(html)
    }

    fs.createReadStream(file).pipe(res)
  })
  .listen(PORT, '0.0.0.0', () => {
    console.log(`preview: http://0.0.0.0:${PORT}  (api -> 127.0.0.1:${API_PORT})`)
  })
