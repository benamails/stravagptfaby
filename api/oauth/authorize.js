// api/oauth/authorize.js
import { makeLogger } from '../_log.js'

const BASE = process.env.PUBLIC_BASE_URL
const CID  = process.env.STRAVA_CLIENT_ID

// ChatGPT / OpenAI builder hosts that are allowed to receive the OAuth callback
const TRUSTED_HOSTS = new Set(['chat.openai.com','chatgpt.com','platform.openai.com'])

function b64url(obj){ return Buffer.from(JSON.stringify(obj)).toString('base64url') }

function isAllowedToolRedirect(u) {
  try {
    const url = new URL(String(u))
    return TRUSTED_HOSTS.has(url.hostname) && url.pathname.endsWith('/oauth/callback')
  } catch { return false }
}

export default async function handler(req, res) {
  const log = makeLogger({ route: '/api/oauth/authorize', method: req.method })
  try {
    if (req.method !== 'GET' && req.method !== 'POST') {
      return res.status(405).end()
    }

    if (!BASE) throw new Error('Missing PUBLIC_BASE_URL')
    if (!CID)  throw new Error('Missing STRAVA_CLIENT_ID')

    // Accept both GET (ChatGPT builder) and POST (manual tests)
    const input = req.method === 'GET'
      ? req.query || {}
      : (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}))

    const scope = (input.scope || 'read,activity:read_all').replace(/\s+/g, ',')
    const tool_redirect_uri = input.redirect_uri
    const tool_state = input.state

    // Hard requirement: we must know where to send the user back in ChatGPT.
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
      redirect_uri, scope,
      stateLen: outState.length,
      toolHost: new URL(tool_redirect_uri).host,
    })
    res.writeHead(302, { Location: url })
    res.end()
  } catch (e) {
    log.error('Authorize failed', { error: String(e) })
    res.status(500).json({ error: 'server_error', details: e.message })
  }
}
