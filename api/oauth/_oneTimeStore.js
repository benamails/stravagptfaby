// api/oauth/_oneTimeStore.js
// Stockage OTC via Upstash Redis (ou autre KV). Expiration courte recommandée (2-5 min).
import { Redis } from '@upstash/redis'
import { randomBytes } from 'crypto'
import { makeLogger } from '../_log.js'

const redis = Redis.fromEnv()
const TTL_SECONDS = 180 // 3 minutes

function b64url(bytes) {
  return Buffer.from(bytes).toString('base64url')
}

export async function issueOneTimeCodeFor(sub, meta = {}) {
  const log = makeLogger({ route: 'otc/issue', ...meta })
  const code = b64url(randomBytes(24))
  const key = `otc:${code}`
  await redis.set(key, String(sub), { ex: TTL_SECONDS })
  log.info('OTC issued', { sub, ttl: TTL_SECONDS })
  return code
}

export async function consumeOneTimeCode(code, meta = {}) {
  const log = makeLogger({ route: 'otc/consume', ...meta })
  const key = `otc:${code}`
  const sub = await redis.get(key)
  if (!sub) {
    log.warn('OTC missing/expired', { codePresent: !!code })
    return null
  }
  await redis.del(key)
  log.info('OTC consumed', { sub })
  return String(sub)
}
