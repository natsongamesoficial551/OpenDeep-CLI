import { inspect } from 'node:util'

const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{16,}/g,
  /sk-or-[A-Za-z0-9_-]{16,}/g,
  /ghp_[A-Za-z0-9_]{16,}/g,
  /github_pat_[A-Za-z0-9_]{16,}/g,
  /AIza[0-9A-Za-z_-]{20,}/g,
  /xox[baprs]-[A-Za-z0-9-]{10,}/g,
  /(?:api[_-]?key|token|secret|password|authorization)(["'\s:=]+)([^\s"']{8,})/gi,
]

export function redact(input: unknown): string {
  const text = typeof input === 'string' ? input : inspect(input, { depth: 6, colors: false })
  return SECRET_PATTERNS.reduce((current, pattern) => current.replace(pattern, (match, sep) => {
    if (typeof sep === 'string' && match.includes(sep)) return match.replace(/([^\s"']{8,})$/, '[REDACTED]')
    return '[REDACTED]'
  }), text)
}

export function redactObject<T>(value: T): T {
  if (Array.isArray(value)) return value.map(redactObject) as T
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (/key|token|secret|password|authorization/i.test(key)) return [key, '[REDACTED]']
    return [key, redactObject(item)]
  })) as T
}

export function safeError(error: unknown): string {
  if (error instanceof Error) return redact(error.message)
  return redact(error)
}
