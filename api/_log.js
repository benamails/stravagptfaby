// api/_log.js
export function makeLogger(context = {}) {
  const start = Date.now()
  const reqId = context.reqId || Math.random().toString(36).slice(2, 10)

  const base = (level, msg, extra) => {
    const delta = Date.now() - start
    const payload = { reqId, t: delta + 'ms', ...context, ...(extra || {}) }
    // Utilise console.* (Vercel regroupe par ligne)
    console[level](`[${level.toUpperCase()}] ${msg} | ${JSON.stringify(payload)}`)
  }

  return {
    reqId,
    info: (msg, extra) => base('info', msg, extra),
    warn: (msg, extra) => base('warn', msg, extra),
    error: (msg, extra) => base('error', msg, extra),
    debug: (msg, extra) => base('debug', msg, extra),
  }
}