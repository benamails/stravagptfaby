// lib/logger.ts
// Logger JSON minimaliste pour homogénéiser les logs backend.
// Ajoute reqId, route et durée pour faciliter le debug Vercel.

type LogLevel = "info" | "warn" | "error";

export interface LogMeta {
  reqId?: string;
  route?: string;
  method?: string;
  t?: string | number; // durée ou timestamp
  [key: string]: any;
}

function baseLog(level: LogLevel, msg: string, meta?: LogMeta) {
  const entry = {
    level,
    msg,
    ...meta,
    ts: new Date().toISOString(),
  };
  // On logge toujours en JSON pour faciliter la recherche (ex: Vercel logs)
  console.log(JSON.stringify(entry));
}

export const logger = {
  info: (msg: string, meta?: LogMeta) => baseLog("info", msg, meta),
  warn: (msg: string, meta?: LogMeta) => baseLog("warn", msg, meta),
  error: (msg: string, meta?: LogMeta) => baseLog("error", msg, meta),
};

// Exemple d’utilisation :
// logger.info("Redirecting to Strava", { reqId, route: "/api/oauth/authorize", t: "1ms" });
