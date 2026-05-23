// ══════════════════════════════════════════════════════════════════
// lib/logger.js — Structured Logger
// ══════════════════════════════════════════════════════════════════

var isDev = process.env.NODE_ENV !== 'production';

function log(level, module, message, data) {
  var entry = {
    ts:      new Date().toISOString(),
    level:   level,
    module:  module,
    message: message
  };
  if (data) entry.data = data;

  if (isDev) {
    // Development: pretty print
    var prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : level === 'info' ? '✅' : '🔍';
    console.log(prefix + ' [' + module + '] ' + message + (data ? ' ' + JSON.stringify(data) : ''));
  } else {
    // Production: JSON untuk Vercel logs
    console.log(JSON.stringify(entry));
  }
}

module.exports = {
  info:  (mod, msg, data) => log('info',  mod, msg, data),
  warn:  (mod, msg, data) => log('warn',  mod, msg, data),
  error: (mod, msg, data) => log('error', mod, msg, data),
  debug: (mod, msg, data) => log('debug', mod, msg, data)
};
