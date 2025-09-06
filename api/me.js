// api/me.js
import jwt from 'jsonwebtoken'
import { getValidAccessToken } from './_store.js'
import { makeLogger } from './_log.js'

const JWT_SECRET = process.env.JWT_SECRET || 'change-me'

export default async function handler(req, res) {
  const log = makeLogger({ route: '/api/me', method: req.method })
  try {
    if (req.method !== 'GET') return res.status(405).end()

    const auth = req.headers.authorization || ''
    const appJwt = auth.startsWith('Bearer ') ? auth.slice(7) : null
    if (!appJwt) {
      log.warn('Missing Authorization header')
      return res.status(401).json({ error: 'missing_token' })
    }

    const { sub } = jwt.verify(appJwt, JWT_SECRET)
    log.info('JWT verified', { sub })

    const access = await getValidAccessToken(sub, { sub })
    if (!access) {
      log.warn('No Strava token for sub', { sub })
      return res.status(401).json({ error: 'no_strava_token' })
    }

    log.info('Fetching athlete from Strava')
    const r = await fetch('https://www.strava.com/api/v3/athlete', {
      headers: { Authorization: `Bearer ${access}` },
    })
    const data = await r.json()
    if (!r.ok) {
      log.warn('Strava /athlete failed', { status: r.status, data })
      return res.status(r.status).json(data)
    }

    log.info('Athlete fetched ok')
    return res.json(data)
  } catch (e) {
    const status = e.name === 'JsonWebTokenError' ? 401 : 500
    makeLogger({ route: '/api/me' }).error('ME failed', { error: String(e) })
    return res.status(status).json({ error: 'me_failed', details: e.message })
  }
}
