import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile, chmod } from 'node:fs/promises'
import { join } from 'node:path'
import { getConfigDirs } from '../config/paths.js'

const SERVICE = 'opendeep'

type KeytarApi = {
  getPassword(service: string, account: string): Promise<string | null>
  setPassword(service: string, account: string, password: string): Promise<void>
  deletePassword(service: string, account: string): Promise<boolean>
}

async function loadKeytar(): Promise<KeytarApi | undefined> {
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

function fallbackKey() {
  return createHash('sha256').update(`${process.env.USERNAME ?? process.env.USER ?? 'opendeep'}:${process.platform}:opendeep`).digest()
}

function encrypt(value: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', fallbackKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64')
}

function decrypt(value: string) {
  const bytes = Buffer.from(value, 'base64')
  const iv = bytes.subarray(0, 12)
  const tag = bytes.subarray(12, 28)
  const encrypted = bytes.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', fallbackKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}

async function fallbackPath() {
  const dirs = getConfigDirs()
  await mkdir(dirs.config, { recursive: true })
  return join(dirs.config, 'secrets.enc.json')
}

async function readFallback(): Promise<Record<string, string>> {
  const file = await fallbackPath()
  if (!existsSync(file)) return {}
  return JSON.parse(await readFile(file, 'utf8')) as Record<string, string>
}

async function writeFallback(values: Record<string, string>) {
  const file = await fallbackPath()
  await writeFile(file, JSON.stringify(values, null, 2))
  try { await chmod(file, 0o600) } catch {}
}

export async function getSecret(account: string) {
  const env = process.env[account]
  if (env) return env
  const keytar = await loadKeytar()
  if (keytar) return keytar.getPassword(SERVICE, account)
  const values = await readFallback()
  return values[account] ? decrypt(values[account]) : null
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
  if (keytar) return keytar.deletePassword(SERVICE, account)
  const values = await readFallback()
  delete values[account]
  await writeFallback(values)
  return true
}
