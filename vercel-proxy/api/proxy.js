// Vercel serverless function: CORS-forwarding proxy for open.tjstats.com.
//
// Routed here for every path via vercel.json rewrites (not file-system
// dynamic routing — [...all].js catch-all routes only matched a single path
// segment in this project for reasons that weren't worth chasing further;
// vercel.json rewrites are a separate, more predictable mechanism).
//
// req.url reflects the *original* request path (e.g.
// /match-auth-app/open/v1/schedule/stage?seasonId=237), which we forward to
// open.tjstats.com as-is.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.setHeader('Access-Control-Max-Age', '86400')

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  if (req.method !== 'GET') {
    res.status(405).send('Method not allowed')
    return
  }

  if (!req.url.startsWith('/match-auth-app/')) {
    res.status(404).send('Not found')
    return
  }

  const targetUrl = 'https://open.tjstats.com' + req.url

  try {
    const upstreamHeaders = {}
    if (req.headers.authorization) upstreamHeaders.Authorization = req.headers.authorization

    const upstream = await fetch(targetUrl, { method: 'GET', headers: upstreamHeaders })
    const body = await upstream.text()
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
    res.status(upstream.status).send(body)
  } catch (err) {
    res.status(502).send('Proxy error: ' + String(err))
  }
}
