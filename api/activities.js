// api/activities.js
import jwt from 'jsonwebtoken'
import { getValidAccessToken } from './_store.js'
import { makeLogger } from './_log.js'

const JWT_SECRET = process.env.JWT_SECRET || 'change-me'

export default async function handler(req, res) {
  const log = makeLogger({ route: '/api/activities', method: req.method })
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

    const now = Math.floor(Date.now() / 1000)
    const twentyEightDaysAgo = now - 28 * 24 * 60 * 60
    const per_page = 100
    let page = 1
    const out = []

    log.info('Starting activities fetch', { after: twentyEightDaysAgo })

    while (true) {
      const qs = new URLSearchParams({
        after: String(twentyEightDaysAgo),
        per_page: String(per_page),
        page: String(page),
      })
      const url = `https://www.strava.com/api/v3/athlete/activities?${qs.toString()}`
      log.info('Fetching page', { page })

      const r = await fetch(url, { headers: { Authorization: `Bearer ${access}` } })
      const arr = await r.json()
      if (!r.ok) {
        log.warn('Strava activities failed', { status: r.status, arr })
        return res.status(r.status).json(arr)
      }

      out.push(...arr)
      log.info('Page fetched', { page, count: arr.length, total: out.length })

      if (arr.length < per_page) break
      page += 1
      if (page > 5) { // garde-fou
        log.warn('Pagination guard hit (>5 pages)', { total: out.length })
        break
      }
    }

    log.info('Activities done', { total: out.length })
    return res.json(out)
  } catch (e) {
    const status = e.name === 'JsonWebTokenError' ? 401 : 500
    log.error('Activities failed', { error: String(e) })
    return res.status(status).json({ error: 'activities_failed', details: e.message })
  }
}
