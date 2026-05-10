import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile, chmod } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { OpenDeepConfig } from '../types.js'
import { getConfigDirs, ensureDeepCodeDirsMigrated } from './paths.js'

const ConfigSchema = z.object({
  defaultProvider: z.string().default('openai'),
  defaultModel: z.string().default('gpt-4o-mini'),
  providers: z.record(z.string(), z.object({
    id: z.string().optional(),
    name: z.string().optional(),
    kind: z.enum(['openai-compatible', 'anthropic', 'gemini', 'placeholder']).optional(),
    baseUrl: z.string().optional(),
    apiKeyEnv: z.string().optional(),
    modelEnv: z.string().optional(),
    defaultModel: z.string().optional(),
    headers: z.record(z.string(), z.string()).optional(),
    notes: z.string().optional(),
    apiKey: z.string().optional(),
  })).default({}),
  permissions: z.object({
    allowAll: z.boolean().default(false),
    autoAllow: z.boolean().default(false),
    allowShell: z.boolean().default(false),
    allowWrite: z.boolean().default(false),
    allowNetwork: z.boolean().default(true),
  }).default({ allowAll: false, autoAllow: false, allowShell: false, allowWrite: false, allowNetwork: true }),
  ui: z.object({
    stream: z.boolean().default(true),
    color: z.boolean().default(true),
  }).default({ stream: true, color: true }),
})

export const DEFAULT_CONFIG: OpenDeepConfig = ConfigSchema.parse({})

export async function configPath() {
  await ensureDeepCodeDirsMigrated()
  const dirs = getConfigDirs()
  await mkdir(dirs.config, { recursive: true })
  return join(dirs.config, 'config.json')
}

export async function loadConfig(): Promise<OpenDeepConfig> {
  const file = await configPath()
  if (!existsSync(file)) return DEFAULT_CONFIG
  const parsed = JSON.parse(await readFile(file, 'utf8'))
  return ConfigSchema.parse(parsed) as OpenDeepConfig
}

export async function saveConfig(config: OpenDeepConfig) {
  const file = await configPath()
  await writeFile(file, JSON.stringify(ConfigSchema.parse(config), null, 2))
  try { await chmod(file, 0o600) } catch {}
}

export async function updateConfig(mutator: (config: OpenDeepConfig) => OpenDeepConfig | void) {
  const config = await loadConfig()
  const next = mutator(config) ?? config
  await saveConfig(next)
  return next
}
