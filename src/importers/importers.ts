import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { ProviderProfile } from '../types.js'
import { setSecret } from '../security/secrets.js'

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
  if (process.env.CODEX_API_KEY) return { provider: 'codex-oauth', model: process.env.CODEX_MODEL ?? 'gpt-5.5', apiKeyEnv: 'CODEX_OAUTH_TOKEN' }
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

async function readJson(path: string) {
  if (!existsSync(path)) return undefined
  try {
    return JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>
  } catch {
    return undefined
  }
}

function tokenFromJson(data: Record<string, unknown> | undefined): string | undefined {
  if (!data) return undefined
  for (const key of ['api_key', 'apiKey', 'access_token', 'accessToken', 'id_token']) {
    const value = data[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  const tokens = data.tokens
  if (tokens && typeof tokens === 'object') {
    const token: string | undefined = tokenFromJson(tokens as Record<string, unknown>)
    if (token) return token
  }
  const auth = data.auth
  if (auth && typeof auth === 'object') {
    const token: string | undefined = tokenFromJson(auth as Record<string, unknown>)
    if (token) return token
  }
  const openai = data.openai
  if (openai && typeof openai === 'object') {
    const token: string | undefined = tokenFromJson(openai as Record<string, unknown>)
    if (token) return token
  }
  return undefined
}

function codexAuthPaths() {
  const paths = [join(homedir(), '.codex', 'auth.json'), join(homedir(), '.codex', 'config.json')]
  if (process.env.CODEX_AUTH_JSON_PATH) paths.unshift(process.env.CODEX_AUTH_JSON_PATH)
  return paths
}

const CHATGPT_SUBSCRIPTION_GUIDANCE = 'Sua assinatura do ChatGPT não libera API automaticamente. Para usar no DeepCode, rode deepcode codex para OAuth oficial ou configure OPENAI_API_KEY/CODEX_API_KEY no ambiente.'

export async function importCodexLocalAuth() {
  const envToken = process.env.CODEX_API_KEY ?? process.env.OPENAI_API_KEY
  if (envToken?.trim()) {
    await setSecret('CODEX_OAUTH_TOKEN', envToken.trim())
    return { imported: true, source: process.env.CODEX_API_KEY ? 'CODEX_API_KEY' : 'OPENAI_API_KEY', message: 'Credencial Codex importada de variável de ambiente.' }
  }

  for (const path of codexAuthPaths()) {
    const data = await readJson(path)
    const token = tokenFromJson(data)
    if (token) {
      await setSecret('CODEX_OAUTH_TOKEN', token)
      return { imported: true, source: path, message: 'Credencial Codex importada do login local.' }
    }
    if (data) {
      return {
        imported: false,
        source: path,
        message: `Login Codex encontrado, mas token API compatível não disponível. ${CHATGPT_SUBSCRIPTION_GUIDANCE}`,
      }
    }
  }
  return {
    imported: false,
    message: `Nenhum login local do Codex encontrado. Rode o login do Codex CLI/OpenAI primeiro ou configure CODEX_API_KEY/OPENAI_API_KEY. ${CHATGPT_SUBSCRIPTION_GUIDANCE}`,
  }
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
  const codexAuth = await importCodexLocalAuth()
  if (codexAuth.imported) sources.push(`codex:${codexAuth.source}`)
  else if (codexAuth.source) warnings.push(codexAuth.message)
  if (!envProfile && !fileProfile && !codexAuth.imported) warnings.push('No compatible provider settings found in environment or current directory.')
  return { sources, profile: envProfile ?? fileProfile ?? (codexAuth.imported ? { provider: 'codex-oauth', model: process.env.CODEX_MODEL ?? 'gpt-5.5', apiKeyEnv: 'CODEX_OAUTH_TOKEN' } : undefined), warnings }
}
