// Minimal, zero-dependency CORS-forwarding proxy for open.tjstats.com.
//
// Same job as cloudflare-worker/tjstats-proxy.js and vercel-proxy/, but meant
// to run on a server you control (domestic China VPS) — tjstats' gateway
// appears to block major overseas cloud providers (Cloudflare, AWS/Vercel)
// at the network level, so this is the fallback that should actually reach it.
//
// Hardened against being discovered and abused as an open relay: only the
// exact paths this tool calls are allowed, only requests whose Origin is a
// bilibili domain are accepted, and per-IP request rate is capped.
//
// Run:   node proxy.js            (listens on PORT, default 8787)
// Keep alive with pm2:  pm2 start proxy.js --name tjstats-proxy
// Or systemd — see README.md in this folder.

const http = require('http')
const https = require('https')

const PORT = process.env.PORT || 8787
const UPSTREAM_HOST = 'open.tjstats.com'

// Exact set of endpoints this tool actually calls — see src/api.ts.
const ALLOWED_PATH_PREFIXES = [
  '/match-auth-app/open/v1/schedule/season',
  '/match-auth-app/open/v1/schedule/stage',
  '/match-auth-app/open/v1/schedule/match',
  '/match-auth-app/open/v1/compound/public/player',
  '/match-auth-app/open/v1/compound/public/hero',
  '/match-auth-app/open/v1/compound/public/team',
  '/match-auth-app/open/v1/compound/heroRecord',
]

const ALLOWED_ORIGIN_SUFFIXES = ['.bilibili.com', '.bilibilitoy.com']
const ALLOWED_ORIGIN_EXACT = new Set(['https://www.bilibili.com', 'https://bilibili.com', 'https://www.bilibilitoy.com', 'https://bilibilitoy.com'])

function isAllowedOrigin(origin) {
  if (!origin) return false
  if (ALLOWED_ORIGIN_EXACT.has(origin)) return true
  try {
    const host = new URL(origin).hostname
    return ALLOWED_ORIGIN_SUFFIXES.some((suffix) => host.endsWith(suffix))
  } catch {
    return false
  }
}

function isAllowedPath(url) {
  return ALLOWED_PATH_PREFIXES.some((prefix) => url.startsWith(prefix))
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for']
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim()
  return req.socket.remoteAddress || 'unknown'
}

// Simple in-memory sliding-window rate limit: per IP, per minute.
// Normal usage is bursty and legitimately request-heavy — season-tree probing alone
// fires ~30-40 requests on load, and a single "获取数据" pull calls schedule/stage
// once per player (a season can have 100+ players) — so this needs real headroom
// above a typical scraping-bot threshold, not a tight cap.
const RATE_LIMIT_PER_MINUTE = 600
const rateBuckets = new Map() // ip -> { windowStart, count }

function isRateLimited(ip) {
  const now = Date.now()
  const bucket = rateBuckets.get(ip)
  if (!bucket || now - bucket.windowStart >= 60_000) {
    rateBuckets.set(ip, { windowStart: now, count: 1 })
    return false
  }
  bucket.count += 1
  return bucket.count > RATE_LIMIT_PER_MINUTE
}

// Periodically drop stale rate-limit buckets so the Map doesn't grow forever.
setInterval(() => {
  const now = Date.now()
  for (const [ip, bucket] of rateBuckets) {
    if (now - bucket.windowStart >= 60_000) rateBuckets.delete(ip)
  }
}, 5 * 60_000).unref()

// Global cap on concurrent upstream requests — this box has ~400MB RAM, so a burst of
// simultaneous visitors (each firing dozens of requests on load) can pile up enough open
// HTTPS connections to exhaust memory. Reject new work past this ceiling instead of letting
// it queue unbounded; the client-side callers already retry/are resilient to a single failure.
const MAX_CONCURRENT_UPSTREAM = 24
let inFlight = 0

function setCors(res, origin) {
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.setHeader('Access-Control-Max-Age', '86400')
}

const server = http.createServer((req, res) => {
  const origin = req.headers.origin
  const ip = clientIp(req)

  if (!isAllowedOrigin(origin)) {
    console.warn(`[reject:origin] ip=${ip} origin=${origin ?? '(none)'} path=${req.url}`)
    res.writeHead(403)
    res.end('Forbidden')
    return
  }

  setCors(res, origin)

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

  if (isRateLimited(ip)) {
    console.warn(`[reject:rate-limit] ip=${ip} path=${req.url}`)
    res.writeHead(429)
    res.end('Too many requests')
    return
  }

  if (!isAllowedPath(req.url)) {
    console.warn(`[reject:path] ip=${ip} path=${req.url}`)
    res.writeHead(404)
    res.end('Not found')
    return
  }

  if (inFlight >= MAX_CONCURRENT_UPSTREAM) {
    console.warn(`[reject:overloaded] ip=${ip} path=${req.url} inFlight=${inFlight}`)
    res.writeHead(503)
    res.end('Server busy, please retry')
    return
  }

  console.log(`[proxy] ip=${ip} path=${req.url}`)
  inFlight += 1
  let finished = false
  function done() {
    if (finished) return
    finished = true
    inFlight -= 1
  }

  const upstreamReq = https.request(
    {
      hostname: UPSTREAM_HOST,
      path: req.url,
      method: 'GET',
      headers: req.headers.authorization ? { Authorization: req.headers.authorization } : {},
      timeout: 15_000,
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode || 502, {
        'Content-Type': upstreamRes.headers['content-type'] || 'application/json',
      })
      upstreamRes.pipe(res)
      upstreamRes.on('end', done)
      upstreamRes.on('error', done)
    },
  )

  upstreamReq.on('timeout', () => {
    upstreamReq.destroy(new Error('upstream timeout'))
  })

  upstreamReq.on('error', (err) => {
    if (!res.headersSent) res.writeHead(502)
    res.end('Proxy error: ' + String(err))
    done()
  })

  upstreamReq.end()
})

server.listen(PORT, () => {
  console.log(`tjstats proxy listening on :${PORT}`)
})
