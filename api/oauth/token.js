// api/oauth/token.js
// OAuth "Token URL" attendu par le Builder ChatGPT.
// Reçoit un POST x-www-form-urlencoded (ou JSON) avec { code }.
// Ici, "code" est TON OTC (one-time code) émis au callback Strava.
// Répond avec { access_token, token_type, expires_in } pour que le Builder
// attache automatiquement Authorization: Bearer <access_token> aux appels suivants.

import jwt from 'jsonwebtoken'
import { consumeOneTimeCode } from './_oneTimeStore.js'
import { makeLogger } from '../_log.js'

const JWT_SECRET = process.env.JWT_SECRET || 'change-me' // ⚠️ mets une vraie valeur forte

// Parse robuste: accepte x-www-form-urlencoded OU JSON OU query fallback
async function parseBody(req) {
  const ct = (req.headers['content-type'] || '').toLowerCase()
  // Next.js API routes: req.body est parfois déjà parsé (obj), parfois string
  if (ct.includes('application/x-www-form-urlencoded')) {
    if (typeof req.body === 'string') {
      const sp = new URLSearchParams(req.body)
      return { code: sp.get('code') || '' }
    }
    // si déjà parsé en objet
    if (req.body && typeof req.body === 'object') {
      return { code: req.body.code || '' }
    }
  }
  if (ct.includes('application/json')) {
    if (typeof req.body === 'string') {
      try { return JSON.parse(req.body) } catch { return {} }
    }
    if (req.body && typeof req.body === 'object') return req.body
  }
  // Fallback query string (au cas où)
  const q = req.query || {}
  return { code: q.code || '' }
}

export default async function handler(req, res) {
  const log = makeLogger({ route: '/api/oauth/token', method: req.method })
  try {
    if (req.method !== 'POST') return res.status(405).end()

    const { code } = await parseBody(req)
    log.info('OAuth token exchange requested', { hasCode: !!code })

    if (!code) {
      log.warn('Missing code in token exchange')
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Missing code'
      })
    }

    // Consommer ton OTC (émis pendant /api/oauth/callback)
    const sub = await consumeOneTimeCode(code, { route: '/api/oauth/token' })
    if (!sub) {
      log.warn('Invalid or expired OTC')
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: 'Code invalid or expired'
      })
    }

    // Générer ton JWT d’application (sera utilisé comme Bearer)
    const access_token = jwt.sign({ sub }, JWT_SECRET, { expiresIn: '7d' })
    const token_type = 'bearer'
    const expires_in = 7 * 24 * 3600 // 7 jours (exemple)

    log.info('OAuth token issued', { sub })

    // Répondre au format OAuth standard attendu par le Builder
    return res.status(200).json({ access_token, token_type, expires_in })
  } catch (e) {
    log.error('OAuth token endpoint failed', { error: String(e) })
    return res.status(500).json({ error: 'server_error', error_description: e.message })
  }
}
