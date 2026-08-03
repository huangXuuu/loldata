// Minimal, zero-dependency CORS-forwarding proxy for open.tjstats.com.
//
// Same job as cloudflare-worker/tjstats-proxy.js and vercel-proxy/, but meant
// to run on a server you control (domestic China VPS) — tjstats' gateway
// appears to block major overseas cloud providers (Cloudflare, AWS/Vercel)
// at the network level, so this is the fallback that should actually reach it.
//
// Run:   node proxy.js            (listens on PORT, default 8787)
// Keep alive with pm2:  pm2 start proxy.js --name tjstats-proxy
// Or systemd — see README.md in this folder.

const http = require('http')
const https = require('https')

const PORT = process.env.PORT || 8787
const UPSTREAM_HOST = 'open.tjstats.com'

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.setHeader('Access-Control-Max-Age', '86400')
}

const server = http.createServer((req, res) => {
  setCors(res)

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.method !== 'GET') {
    res.writeHead(405)
    res.end('Method not allowed')
    return
  }

  if (!req.url.startsWith('/match-auth-app/')) {
    res.writeHead(404)
    res.end('Not found')
    return
  }

  const upstreamReq = https.request(
    {
      hostname: UPSTREAM_HOST,
      path: req.url,
      method: 'GET',
      headers: req.headers.authorization ? { Authorization: req.headers.authorization } : {},
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode || 502, {
        'Content-Type': upstreamRes.headers['content-type'] || 'application/json',
      })
      upstreamRes.pipe(res)
    },
  )

  upstreamReq.on('error', (err) => {
    res.writeHead(502)
    res.end('Proxy error: ' + String(err))
  })

  upstreamReq.end()
})

server.listen(PORT, () => {
  console.log(`tjstats proxy listening on :${PORT}`)
})
