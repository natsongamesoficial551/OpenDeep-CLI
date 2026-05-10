import envPaths from 'env-paths'
import { existsSync } from 'node:fs'
import { cp, mkdir } from 'node:fs/promises'

export const APP_NAME = 'deepcode'
export const LEGACY_APP_NAME = 'opendeep'

export function getConfigDirs() {
  return envPaths(APP_NAME, { suffix: '' })
}

export function getLegacyConfigDirs() {
  return envPaths(LEGACY_APP_NAME, { suffix: '' })
}

let migrationPromise: Promise<void> | undefined

async function copyDirIfNeeded(from: string, to: string) {
  if (!existsSync(from) || existsSync(to)) return
  await mkdir(to, { recursive: true })
  await cp(from, to, { recursive: true, force: false, errorOnExist: false })
}

export async function ensureDeepCodeDirsMigrated() {
  migrationPromise ??= (async () => {
    const legacy = getLegacyConfigDirs()
    const current = getConfigDirs()
    await Promise.all([
      copyDirIfNeeded(legacy.config, current.config),
      copyDirIfNeeded(legacy.data, current.data),
      copyDirIfNeeded(legacy.cache, current.cache),
      copyDirIfNeeded(legacy.log, current.log),
    ])
  })()
  return migrationPromise
}
