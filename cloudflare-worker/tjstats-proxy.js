// Cloudflare Worker: CORS-forwarding proxy for open.tjstats.com.
//
// The Toy platform only hosts static files (no server), and open.tjstats.com
// does not send Access-Control-Allow-Origin, so the browser can't call it
// directly from a deployed Toy page. This worker sits between the two: the
// page calls the worker (same-origin as far as CORS is concerned, since the
// worker sends permissive CORS headers back), and the worker forwards the
// request to open.tjstats.com server-side, where CORS doesn't apply.
//
// Deploy: Cloudflare dashboard -> Workers & Pages -> Create -> paste this
// file's contents into the editor -> Deploy. Then copy the worker's
// *.workers.dev URL and give it to me so I can update config.ts.

const UPSTREAM = 'https://open.tjstats.com'
const ALLOWED_PREFIX = '/match-auth-app/'

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
  }
}

export default {
  async fetch(request) {
    const url = new URL(request.url)

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() })
    }

    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders() })
    }

    if (!url.pathname.startsWith(ALLOWED_PREFIX)) {
      return new Response('Not found', { status: 404, headers: corsHeaders() })
    }

    const targetUrl = UPSTREAM + url.pathname + url.search
    const upstreamHeaders = new Headers()
    const auth = request.headers.get('Authorization')
    if (auth) upstreamHeaders.set('Authorization', auth)

    const upstreamResp = await fetch(targetUrl, { method: 'GET', headers: upstreamHeaders })

    const respHeaders = new Headers(upstreamResp.headers)
    for (const [k, v] of Object.entries(corsHeaders())) respHeaders.set(k, v)

    return new Response(upstreamResp.body, { status: upstreamResp.status, headers: respHeaders })
  },
}
