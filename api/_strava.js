// api/_strava.js
import { makeLogger } from './_log.js'
import { getTokens, saveTokens } from './_store.js'

const CID  = process.env.STRAVA_CLIENT_ID
const CSEC = process.env.STRAVA_CLIENT_SECRET
const BASE = process.env.PUBLIC_BASE_URL

if (!CID || !CSEC || !BASE) {
  // Laisse échouer tôt si la config manque
  console.warn('[STRAVA] Missing ENV (STRAVA_CLIENT_ID/SECRET or PUBLIC_BASE_URL)')
}

async function refreshIfNeeded(sub, tks, log) {
  const now = Math.floor(Date.now() / 1000)
  // marge 60s
  if (tks?.expires_at && Number(tks.expires_at) > now + 60) return tks

  // refresh
  log.info('Refreshing Strava token', { sub })
  const body = new URLSearchParams({
    client_id: CID,
    client_secret: CSEC,
    grant_type: 'refresh_token',
    refresh_token: tks.refresh_token,
  })
  const r = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const data = await r.json()
  if (!r.ok) {
    log.error('Strava token refresh failed', { status: r.status, data })
    throw new Error('strava_refresh_failed')
  }
  const newTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || tks.refresh_token,
    expires_at: data.expires_at,
    scope: data.scope || tks.scope,
    athlete: tks.athlete,
  }
  await saveTokens(sub, newTokens, { route: '_strava.refresh' })
  return newTokens
}

export async function stravaFetch(sub, path, log, init = {}) {
  if (!path.startsWith('/')) throw new Error('strava path must start with /')
  const tokens = await getTokens(sub)
  if (!tokens?.access_token) {
    log.warn('No Strava tokens for user', { sub })
    throw new Error('no_strava_tokens')
  }
  const tks = await refreshIfNeeded(sub, tokens, log)
  const url = `https://www.strava.com/api/v3${path}`
  const r = await fetch(url, {
    method: init.method || 'GET',
    headers: {
      'Authorization': `Bearer ${tks.access_token}`,
      ...(init.headers || {})
    },
    body: init.body,
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) {
    log.error('Strava fetch failed', { path, status: r.status, data })
    const e = new Error('strava_fetch_failed')
    e.status = r.status
    e.data = data
    throw e
  }
  return data
}
