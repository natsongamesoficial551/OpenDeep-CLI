import { ProviderConfig } from '../types.js'

export const RECOMMENDED_MODELS: Record<string, string[]> = {
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-5.5'],
  anthropic: ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest', 'claude-opus-4-1'],
  gemini: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-pro'],
  openrouter: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-sonnet', 'google/gemini-2.5-flash'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
  mistral: ['mistral-large-latest', 'codestral-latest', 'ministral-8b-latest'],
  ollama: ['llama3.2', 'qwen2.5-coder', 'mistral'],
  lmstudio: ['local-model'],
  'github-models': ['gpt-4o-mini', 'gpt-4o', 'Phi-3.5-mini-instruct'],
  bedrock: ['anthropic.claude-3-5-sonnet-20240620-v1:0'],
  vertex: ['gemini-2.5-flash', 'gemini-2.5-pro'],
  foundry: ['claude-sonnet-4-5'],
  codex: ['gpt-5.5', 'gpt-4o-mini'],
  'codex-oauth': ['gpt-5.5'],
}

export function modelsFor(provider: ProviderConfig) {
  return RECOMMENDED_MODELS[provider.id] ?? [provider.defaultModel]
}

export function formatModelCatalog(providers: ProviderConfig[], providerId?: string) {
  const selected = providerId ? providers.filter((provider) => provider.id === providerId) : providers
  return selected.map((provider) => {
    const models = modelsFor(provider).map((model) => `  - ${provider.id}/${model}`).join('\n')
    return `${provider.name} (${provider.id})\n${models}`
  }).join('\n\n')
}

export function parseProviderModel(input: string, currentProvider: string) {
  const trimmed = input.trim()
  if (!trimmed) return undefined
  if (!trimmed.includes('/')) return { providerId: currentProvider, model: trimmed }
  const [providerId, model] = trimmed.split(/\/(.+)/).filter(Boolean)
  if (!providerId || !model) return undefined
  return { providerId, model }
}
