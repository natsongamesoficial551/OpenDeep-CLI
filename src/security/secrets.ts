import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile, chmod } from 'node:fs/promises'
import { join } from 'node:path'
import { getConfigDirs, getLegacyConfigDirs, ensureDeepCodeDirsMigrated } from '../config/paths.js'

const SERVICE = 'deepcode'
const LEGACY_SERVICE = 'opendeep'

type KeytarApi = {
  getPassword(service: string, account: string): Promise<string | null>
  setPassword(service: string, account: string, password: string): Promise<void>
  deletePassword(service: string, account: string): Promise<boolean>
}

async function loadKeytar(): Promise<KeytarApi | undefined> {
  if (process.env.DEEPCODE_DISABLE_KEYTAR === '1' || process.env.DEEPCODE_SECRETS_PATH) return undefined
  try {
    const imported = await import('keytar')
    const candidate = ('default' in imported ? imported.default : imported) as Partial<KeytarApi>
    if (typeof candidate.getPassword === 'function' && typeof candidate.setPassword === 'function' && typeof candidate.deletePassword === 'function') {
      return candidate as KeytarApi
    }
    return undefined
  } catch {
    return undefined
  }
}

function fallbackKey(appName = SERVICE) {
  return createHash('sha256').update(`${process.env.USERNAME ?? process.env.USER ?? appName}:${process.platform}:${appName}`).digest()
}

function encrypt(value: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', fallbackKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64')
}

function decryptWithKey(value: string, appName: string) {
  const bytes = Buffer.from(value, 'base64')
  const iv = bytes.subarray(0, 12)
  const tag = bytes.subarray(12, 28)
  const encrypted = bytes.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', fallbackKey(appName), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}

function decrypt(value: string) {
  try {
    return decryptWithKey(value, SERVICE)
  } catch {
    return decryptWithKey(value, LEGACY_SERVICE)
  }
}

async function fallbackPath(legacy = false) {
  if (!legacy && process.env.DEEPCODE_SECRETS_PATH) return process.env.DEEPCODE_SECRETS_PATH
  const dirs = legacy ? getLegacyConfigDirs() : getConfigDirs()
  await mkdir(dirs.config, { recursive: true })
  return join(dirs.config, 'secrets.enc.json')
}

async function readFallback(legacy = false): Promise<Record<string, string>> {
  if (!legacy) await ensureDeepCodeDirsMigrated()
  const file = await fallbackPath(legacy)
  if (!existsSync(file)) return {}
  return JSON.parse(await readFile(file, 'utf8')) as Record<string, string>
}

async function writeFallback(values: Record<string, string>) {
  await ensureDeepCodeDirsMigrated()
  const file = await fallbackPath()
  await writeFile(file, JSON.stringify(values, null, 2))
  try { await chmod(file, 0o600) } catch {}
}

export async function getSecret(account: string) {
  const env = process.env[account]
  if (env) return env
  const keytar = await loadKeytar()
  if (keytar) {
    const current = await keytar.getPassword(SERVICE, account)
    if (current) return current
    const legacy = await keytar.getPassword(LEGACY_SERVICE, account)
    if (legacy) await keytar.setPassword(SERVICE, account, legacy)
    return legacy
  }
  const values = await readFallback()
  if (values[account]) return decrypt(values[account])
  const legacyValues = await readFallback(true)
  if (!legacyValues[account]) return null
  const legacySecret = decrypt(legacyValues[account])
  values[account] = encrypt(legacySecret)
  await writeFallback(values)
  return legacySecret
}

export async function setSecret(account: string, value: string) {
  const keytar = await loadKeytar()
  if (keytar) {
    await keytar.setPassword(SERVICE, account, value)
    return 'keychain'
  }
  const values = await readFallback()
  values[account] = encrypt(value)
  await writeFallback(values)
  return 'encrypted-file'
}

export async function deleteSecret(account: string) {
  const keytar = await loadKeytar()
  if (keytar) {
    const current = await keytar.deletePassword(SERVICE, account)
    const legacy = await keytar.deletePassword(LEGACY_SERVICE, account)
    return current || legacy
  }
  const values = await readFallback()
  delete values[account]
  await writeFallback(values)
  const legacyValues = await readFallback(true)
  delete legacyValues[account]
  return true
}
