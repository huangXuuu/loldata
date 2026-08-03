// Vercel serverless function: CORS-forwarding proxy for open.tjstats.com.
//
// Same purpose as cloudflare-worker/tjstats-proxy.js, but deployed on Vercel
// instead of Cloudflare — tjstats' gateway appears to hard-block Cloudflare's
// edge IP ranges at the TLS layer (HTTP 525), so this tries a different
// network path. Deployed separately from the main app; only used as the
// production API_BASE_URL target.

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

  const targetPath = req.url.replace(/^\/api/, '')
  if (!targetPath.startsWith('/match-auth-app/')) {
    res.status(404).send('Not found')
    return
  }

  const targetUrl = 'https://open.tjstats.com' + targetPath

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
