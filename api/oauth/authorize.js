// api/oauth/authorize.js
import { makeLogger } from '../_log.js'

const TRUSTED_HOSTS = new Set(['chat.openai.com','chatgpt.com','platform.openai.com'])

function b64url(obj){ return Buffer.from(JSON.stringify(obj)).toString('base64url') }

function isAllowedToolRedirect(u) {
  try {
    const url = new URL(String(u))
    return TRUSTED_HOSTS.has(url.hostname) && url.pathname.endsWith('/oauth/callback')
  } catch { return false }
}

function getEnv(name) {
  const val = process.env[name]
  if (!val) throw new Error(`Missing ${name}`)
  return val
}

export default async function handler(req, res) {
  // Empêche d'éventuels caches intermédiaires de réutiliser une réponse
  res.setHeader('Cache-Control', 'no-store')

  const log = makeLogger({ route: '/api/oauth/authorize', method: req.method })
  try {
    if (req.method !== 'GET' && req.method !== 'POST') {
      return res.status(405).end()
    }

    // ⚠️ Lecture des ENV à CHAQUE requête (pas au top-level)
    const BASE = getEnv('PUBLIC_BASE_URL')
    const CID  = getEnv('STRAVA_CLIENT_ID')

    // GET (builder) ou POST (tests)
    const input = req.method === 'GET'
      ? (req.query || {})
      : (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}))

    const scope = (input.scope || 'read,activity:read_all').replace(/\s+/g, ',')
    const tool_redirect_uri = input.redirect_uri
    const tool_state = input.state

    if (!tool_redirect_uri || !isAllowedToolRedirect(tool_redirect_uri)) {
      log.warn('Missing or untrusted redirect_uri', { has: !!tool_redirect_uri, redirect_uri: tool_redirect_uri || null })
      return res.status(400).json({
        error: 'missing_redirect_uri',
        error_description: 'Expected a builder-provided redirect_uri to return to the active ChatGPT conversation.'
      })
    }

    const state = { tool_redirect_uri, tool_state }
    const outState = b64url(state)

    const redirect_uri = `${BASE}/api/oauth/callback`
    const params = new URLSearchParams({
      client_id: CID,
      response_type: 'code',
      redirect_uri,
      scope,
      approval_prompt: 'auto',
      state: outState,
    })

    const url = `https://www.strava.com/oauth/authorize?${params.toString()}`
    log.info('Redirecting to Strava', {
      cidUsed: CID,                 // ← LOG du client_id réellement utilisé
      redirect_uri,
      scope,
      stateLen: outState.length,
      toolHost: new URL(tool_redirect_uri).host,
      baseHost: new URL(BASE).host,
    })
    res.writeHead(302, { Location: url })
    res.end()
  } catch (e) {
    log.error('Authorize failed', { error: String(e) })
    res.status(500).json({ error: 'server_error', details: e.message })
  }
}