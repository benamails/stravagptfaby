// api/token.js
import jwt from 'jsonwebtoken'
import { consumeOneTimeCode } from './oauth/_oneTimeStore.js'
import { makeLogger } from './_log.js'

const JWT_SECRET = process.env.JWT_SECRET || 'change-me'

export default async function handler(req, res) {
  const log = makeLogger({ route: '/api/token', method: req.method })
  try {
    if (req.method !== 'POST') return res.status(405).end()

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const code = body?.code
    log.info('Token exchange requested', { hasCode: !!code })

    if (!code) {
      log.warn('Missing one-time code')
      return res.status(400).json({ error: 'invalid_request', error_description: 'Missing code' })
    }

    const sub = await consumeOneTimeCode(code, { route: '/api/token' })
    log.info('OTC consumed', { ok: !!sub })

    if (!sub) {
      log.warn('Invalid or expired OTC')
      return res.status(400).json({ error: 'invalid_grant', error_description: 'Code invalid or expired' })
    }

    const token = jwt.sign({ sub }, JWT_SECRET, { expiresIn: '7d' })
    log.info('App-JWT issued', { sub })

    return res.json({ token, token_type: 'bearer', expires_in: 7 * 24 * 3600 })
  } catch (e) {
    log.error('Token endpoint failed', { error: String(e) })
    return res.status(500).json({ error: 'server_error', details: e.message })
  }
}
