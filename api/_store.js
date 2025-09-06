// api/_store.js
import { Redis } from '@upstash/redis'
import { makeLogger } from './_log.js'

const redis = Redis.fromEnv()

const TOK_KEY = (sub) => `strava:tokens:${sub}`
const CID  = process.env.STRAVA_CLIENT_ID
const CSEC = process.env.STRAVA_CLIENT_SECRET

export async function saveTokens(sub, payload, ctx = {}) {
  const log = makeLogger({ ...ctx, op: 'saveTokens', sub })
  if (!sub) throw new Error('saveTokens: missing sub')
  await redis.set(TOK_KEY(sub), JSON.stringify(payload))
  log.info('Tokens saved')
  return true
}

export async function getTokens(sub, ctx = {}) {
  const log = makeLogger({ ...ctx, op: 'getTokens', sub })
  if (!sub) return null
  const raw = await redis.get(TOK_KEY(sub))
  log.info('Tokens fetched', { found: !!raw })
  return typeof raw === 'string' ? JSON.parse(raw) : raw
}

export async function updateTokens(sub, updates, ctx = {}) {
  const log = makeLogger({ ...ctx, op: 'updateTokens', sub })
  const curr = (await getTokens(sub, ctx)) || {}
  const next = { ...curr, ...updates }
  await saveTokens(sub, next, ctx)
  log.info('Tokens updated')
  return next
}

async function refreshTokens(refresh_token, ctx = {}) {
  const log = makeLogger({ ...ctx, op: 'refreshTokens' })
  if (!CID || !CSEC) throw new Error('Missing STRAVA_CLIENT_ID/SECRET')
  log.info('Refreshing Strava token')

  const body = new URLSearchParams({
    client_id: CID,
    client_secret: CSEC,
    grant_type: 'refresh_token',
    refresh_token,
  })

  const resp = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  const data = await resp.json()
  if (!resp.ok) {
    log.error('Strava refresh failed', { status: resp.status, data })
    const msg = data?.message || resp.statusText
    throw new Error(`Strava refresh failed: ${msg}`)
  }

  const { access_token, refresh_token: new_refresh, expires_at, scope, athlete } = data
  log.info('Strava refresh ok', { expires_at })
  return { access_token, refresh_token: new_refresh, expires_at, scope, athlete }
}

export async function getValidAccessToken(sub, ctx = {}) {
  const log = makeLogger({ ...ctx, op: 'getValidAccessToken', sub })
  const tok = await getTokens(sub, ctx)
  if (!tok?.access_token) {
    log.warn('No access token in store')
    return null
  }

  const now = Math.floor(Date.now() / 1000)
  if (tok.expires_at && tok.expires_at - 60 > now) {
    log.info('Access token still valid', { expires_at: tok.expires_at, now })
    return tok.access_token
  }

  log.info('Access token expired → refreshing')
  const refreshed = await refreshTokens(tok.refresh_token, ctx)
  await saveTokens(sub, {
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token,
    expires_at: refreshed.expires_at,
    scope: refreshed.scope,
    athlete: refreshed.athlete || tok.athlete,
  }, ctx)
  return refreshed.access_token
}
