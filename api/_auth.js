// api/_auth.js
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'change-me'

export function verifyAppAuth(req) {
  const h = req.headers.authorization || req.headers.Authorization
  if (!h || !/^Bearer\s+/i.test(h)) {
    return { ok: false, error: 'missing_bearer' }
  }
  const token = h.replace(/^Bearer\s+/i, '').trim()
  try {
    const payload = jwt.verify(token, JWT_SECRET) // { sub: <athleteId> }
    if (!payload?.sub) return { ok: false, error: 'invalid_sub' }
    return { ok: true, sub: String(payload.sub) }
  } catch (e) {
    return { ok: false, error: 'invalid_token', details: String(e) }
  }
}
