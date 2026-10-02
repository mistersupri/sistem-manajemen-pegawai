// Log terstruktur (JSON per baris). Kunci sensitif disamarkan agar NIK, token,
// password, secret, dan embedding wajah tidak pernah tertulis ke log.
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;
const SENSITIVE = /(password|token|secret|nik|descriptor|embedding|template|cookie|authorization|comm_?key|mfa)/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 5 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.length > 20 ? `[array ${value.length}]` : value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = SENSITIVE.test(k) ? '[disamarkan]' : redact(v, depth + 1);
  return out;
}

function write(level: Level, msg: string, ctx?: Record<string, unknown>) {
  const min = LEVELS[(process.env.LOG_LEVEL as Level) || 'info'] ?? 20;
  if (LEVELS[level] < min) return;
  const line = JSON.stringify({ time: new Date().toISOString(), level, msg, ...(ctx ? (redact(ctx) as object) : {}) });
  (level === 'error' || level === 'warn' ? process.stderr : process.stdout).write(line + '\n');
}

export const log = {
  debug: (msg: string, ctx?: Record<string, unknown>) => write('debug', msg, ctx),
  info: (msg: string, ctx?: Record<string, unknown>) => write('info', msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => write('warn', msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => write('error', msg, ctx),
};
export { redact };
