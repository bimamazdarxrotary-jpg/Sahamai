// ══════════════════════════════════════════════════════════════════
// lib/logger.js — Structured Logger
// ══════════════════════════════════════════════════════════════════

const isDev      = process.env.NODE_ENV !== 'production';
const LOG_LEVEL  = process.env.LOG_LEVEL || (isDev ? 'debug' : 'info');
const LEVELS     = { debug: 0, info: 1, warn: 2, error: 3 };
const minLevel   = LEVELS[LOG_LEVEL] ?? 1;

function log(level, module, message, data) {
  if ((LEVELS[level] ?? 0) < minLevel) return; // filter berdasarkan LOG_LEVEL
  const entry = {
    ts:      new Date().toISOString(),
    level:   level,
    module:  module,
    message: message
  };
  if (data) entry.data = data;

  if (isDev) {
    const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : level === 'info' ? '✅' : '🔍';
    console.log(prefix + ' [' + module + '] ' + message + (data ? ' ' + JSON.stringify(data) : ''));
  } else {
    console.log(JSON.stringify(entry));
  }
}

module.exports = {
  // Bug fix: sebelumnya hanya menerima 1 argumen data (mod, msg, data) — banyak call
  // site di codebase mengirim 4-5 argumen (mis. log.info('analyze','[IND]',ticker,
  // 'RSI='+x,'EMA9='+y)) dan argumen ke-4/5 DIAM-DIAM HILANG karena tidak pernah dibaca.
  // Sekarang argumen ekstra ditangkap via rest params — jika lebih dari satu, digabung
  // jadi array agar semua informasi tetap tercatat di log.
  info:  (mod, msg, ...rest) => log('info',  mod, msg, rest.length > 1 ? rest : rest[0]),
  warn:  (mod, msg, ...rest) => log('warn',  mod, msg, rest.length > 1 ? rest : rest[0]),
  error: (mod, msg, ...rest) => log('error', mod, msg, rest.length > 1 ? rest : rest[0]),
  debug: (mod, msg, ...rest) => log('debug', mod, msg, rest.length > 1 ? rest : rest[0])
};
