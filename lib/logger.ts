type LogLevel = "info" | "warn" | "error";
export interface LogMeta { reqId?: string; route?: string; method?: string; t?: string | number; [k: string]: any; }
function baseLog(level: LogLevel, msg: string, meta?: LogMeta) {
  const entry = { level, msg, ...meta, ts: new Date().toISOString() };
  console.log(JSON.stringify(entry));
}
export const logger = {
  info: (msg: string, meta?: LogMeta) => baseLog("info", msg, meta),
  warn: (msg: string, meta?: LogMeta) => baseLog("warn", msg, meta),
  error: (msg: string, meta?: LogMeta) => baseLog("error", msg, meta)
};
