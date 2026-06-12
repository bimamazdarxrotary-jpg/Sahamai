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
  info:  (mod, msg, data) => log('info',  mod, msg, data),
  warn:  (mod, msg, data) => log('warn',  mod, msg, data),
  error: (mod, msg, data) => log('error', mod, msg, data),
  debug: (mod, msg, data) => log('debug', mod, msg, data)
};
