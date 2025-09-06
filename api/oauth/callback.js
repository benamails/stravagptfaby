// api/oauth/callback.js
import { saveTokens } from '../_store.js'
import { issueOneTimeCodeFor } from './_oneTimeStore.js'
import { makeLogger } from '../_log.js'

const CID  = process.env.STRAVA_CLIENT_ID
const CSEC = process.env.STRAVA_CLIENT_SECRET
const BASE = process.env.PUBLIC_BASE_URL
const ALLOWED_REDIRECT_HOSTS = new Set(['chat.openai.com','chatgpt.com','platform.openai.com'])

function safeParseState(raw){
  try { return JSON.parse(Buffer.from(String(raw), 'base64url').toString()) } catch {}
  try { return JSON.parse(String(raw)) } catch {}
  return {}
}

function buildBackUrl(tool_redirect_uri, code, tool_state){
  try {
    const u = new URL(String(tool_redirect_uri))
    if (!ALLOWED_REDIRECT_HOSTS.has(u.hostname)) return null
    u.searchParams.set('code', code)
    if (tool_state) u.searchParams.set('state', tool_state)
    return u.toString()
  } catch { return null }
}

export default async function handler(req, res) {
  const log = makeLogger({ route: '/api/oauth/callback', method: req.method })
  try {
    if (req.method !== 'GET') return res.status(405).end()

    const code  = req.query?.code
    const rawSt = req.query?.state
    log.info('Callback hit', { hasCode: !!code, hasState: !!rawSt })

    if (!BASE) throw new Error('Missing PUBLIC_BASE_URL')
    if (!CID || !CSEC) throw new Error('Missing STRAVA_CLIENT_ID/SECRET')

    if (!code) {
      log.warn('Missing code in callback')
      return res.status(400).send('missing_code')
    }

    const st = safeParseState(rawSt)

    // 1) Exchange the Strava authorization code for tokens
    const body = new URLSearchParams({
      client_id: CID,
      client_secret: CSEC,
      code,
      grant_type: 'authorization_code',
      redirect_uri: `${BASE}/api/oauth/callback`,
    })
    const r = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    const data = await r.json()
    if (!r.ok) {
      log.error('Strava token exchange failed', { status: r.status, data })
      return res.status(502).send('strava_exchange_failed')
    }

    const sub = String(data?.athlete?.id || '')
    if (!sub) {
      log.error('No athlete id in Strava response', { data })
      return res.status(502).send('no_athlete_id')
    }

    // 2) Persist tokens
    await saveTokens(sub, {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at,
      scope: data.scope,
      athlete: data.athlete,
    }, { route: '/api/oauth/callback' })

    // 3) Issue one-time code (OTC) for the tool's /api/token exchange
    const otc = await issueOneTimeCodeFor(sub, { route: '/api/oauth/callback' })

    // 4) Prefer a hard redirect back to the builder's OAuth callback
    const backUrl = st?.tool_redirect_uri ? buildBackUrl(st.tool_redirect_uri, otc, st.tool_state) : null
    if (backUrl) {
      log.info('302 back to tool', { host: new URL(backUrl).host })
      res.writeHead(302, { Location: backUrl })
      return res.end()
    }

    // 5) Fallback HTML with postMessage + manual code display
    const html = `<!doctype html><meta charset="utf-8"><title>Connexion Strava…</title>
<body style="font-family:system-ui;margin:2rem;"><p id="s">Finalisation…</p>
<script>(function(){var c=${JSON.stringify(otc)},s=${JSON.stringify(st.tool_state||'')};
try{if(window.opener){var a=[{type:'chatgpt#actions:oauth-callback',code:c,state:s}];window.opener.postMessage(a,'*');setTimeout(function(){try{window.close()}catch(e){}},200);return;}}catch(e){}
document.getElementById('s').innerHTML='Retour automatique indisponible.<br>Code : <code>'+c+'</code>';})();</script></body>`
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    log.warn('Falling back to HTML postMessage/manual code')
    return res.status(200).send(html)
  } catch (e) {
    log.error('Callback failed', { error: String(e) })
    return res.status(500).send(e.message || 'callback_failed')
  }
}
