import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ProviderProfile } from '../types.js'

export interface ImportPreview {
  sources: string[]
  profile?: ProviderProfile | undefined
  warnings: string[]
}

function withOptional(profile: ProviderProfile, baseUrl?: string, apiKeyEnv?: string): ProviderProfile {
  return {
    ...profile,
    ...(baseUrl === undefined ? {} : { baseUrl }),
    ...(apiKeyEnv === undefined ? {} : { apiKeyEnv }),
  }
}

function fromEnv(): ProviderProfile | undefined {
  if (process.env.OPENAI_API_KEY || process.env.OPENAI_BASE_URL || process.env.OPENAI_MODEL) {
    if (process.env.OPENAI_BASE_URL?.includes('openrouter')) return withOptional({ provider: 'openrouter', model: process.env.OPENAI_MODEL ?? 'openai/gpt-4o-mini' }, process.env.OPENAI_BASE_URL, 'OPENAI_API_KEY')
    if (process.env.OPENAI_BASE_URL?.includes('deepseek')) return withOptional({ provider: 'deepseek', model: process.env.OPENAI_MODEL ?? 'deepseek-chat' }, process.env.OPENAI_BASE_URL, 'OPENAI_API_KEY')
    if (process.env.OPENAI_BASE_URL?.includes('localhost:11434')) return withOptional({ provider: 'ollama', model: process.env.OPENAI_MODEL ?? 'llama3.2' }, process.env.OPENAI_BASE_URL)
    return withOptional({ provider: 'openai', model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini' }, process.env.OPENAI_BASE_URL, 'OPENAI_API_KEY')
  }
  if (process.env.ANTHROPIC_API_KEY) return { provider: 'anthropic', model: process.env.ANTHROPIC_MODEL ?? 'claude-3-5-sonnet-latest', apiKeyEnv: 'ANTHROPIC_API_KEY' }
  if (process.env.GEMINI_API_KEY) return { provider: 'gemini', model: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash', apiKeyEnv: 'GEMINI_API_KEY' }
  return undefined
}

async function fromOpenCodeFile(cwd: string): Promise<ProviderProfile | undefined> {
  for (const name of ['opencode.json', 'opencode.jsonc']) {
    const file = join(cwd, name)
    if (!existsSync(file)) continue
    const raw = await readFile(file, 'utf8')
    const modelMatch = raw.match(/"model"\s*:\s*"([^"]+)"/)
    if (!modelMatch?.[1]) continue
    const [provider, model] = modelMatch[1].split(/\/(.+)/).filter(Boolean)
    if (provider && model) return { provider, model }
  }
  return undefined
}

export async function previewImports(cwd: string): Promise<ImportPreview> {
  const sources: string[] = []
  const warnings: string[] = []
  const envProfile = fromEnv()
  if (envProfile) sources.push('environment')
  const fileProfile = await fromOpenCodeFile(cwd)
  if (fileProfile) sources.push('opencode.json')
  if (!envProfile && !fileProfile) warnings.push('No compatible provider settings found in environment or current directory.')
  if (process.env.CODEX_API_KEY || process.env.CODEX_AUTH_JSON_PATH) warnings.push('Codex credentials detected; OAuth migration is planned but not copied by MVP importer.')
  return { sources, profile: envProfile ?? fileProfile, warnings }
}
