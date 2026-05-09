import { isIP } from 'node:net'

function isPrivateIPv4(host: string) {
  const parts = host.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return false
  const [a, b] = parts
  if (a === undefined || b === undefined) return false
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || a === 0
}

function normalizeHostname(hostname: string) {
  const lowered = hostname.toLowerCase()
  if (lowered.startsWith('[') && lowered.endsWith(']')) return lowered.slice(1, -1)
  return lowered
}

function isPrivateIPv6(host: string) {
  if (host === '::1' || host === '::') return true
  if (host.startsWith('fc') || host.startsWith('fd')) return true
  if (/^fe[89ab]/.test(host)) return true
  if (host.startsWith('::ffff:')) {
    const mapped = host.slice('::ffff:'.length)
    return isPrivateIPv4(mapped)
  }
  return false
}

export function assertSafeFetchUrl(rawUrl: string) {
  const url = new URL(rawUrl)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only http/https URLs are allowed')
  const hostname = normalizeHostname(url.hostname)
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) throw new Error('Localhost URLs are blocked')
  const ipType = isIP(hostname)
  if (ipType === 4 && isPrivateIPv4(hostname)) throw new Error('Private IPv4 URLs are blocked')
  if (ipType === 6 && isPrivateIPv6(hostname)) throw new Error('Private IPv6 URLs are blocked')
  return url
}
