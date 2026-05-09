import { ProviderConfig } from '../types.js'

export const RECOMMENDED_MODELS: Record<string, string[]> = {
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-5.5'],
  anthropic: ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest', 'claude-opus-4-1'],
  gemini: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-pro'],
  openrouter: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-sonnet', 'google/gemini-2.5-flash'],
  nvidia: ['nvidia/llama-3.3-nemotron-super-49b-v1.5', 'nvidia/llama-3.1-nemotron-70b-instruct', 'meta/llama-3.1-70b-instruct', 'mistralai/mixtral-8x7b-instruct-v0.1'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
  mistral: ['mistral-large-latest', 'codestral-latest', 'ministral-8b-latest'],
  xai: ['grok-2-latest', 'grok-3-mini'],
  perplexity: ['sonar', 'sonar-pro'],
  together: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'Qwen/Qwen2.5-Coder-32B-Instruct', 'deepseek-ai/DeepSeek-V3'],
  fireworks: ['accounts/fireworks/models/llama-v3p1-70b-instruct', 'accounts/fireworks/models/qwen2p5-coder-32b-instruct', 'accounts/fireworks/models/deepseek-v3'],
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
    const models = modelsFor(provider).map((model) => `  - ${model.includes('/') ? model : `${provider.id}/${model}`}`).join('\n')
    return `${provider.name} (${provider.id})\n${models}`
  }).join('\n\n')
}

export function parseProviderModel(input: string, currentProvider: string) {
  const trimmed = input.trim()
  if (!trimmed) return undefined
  const split = trimmed.split(/\/(.+)/).filter(Boolean)
  if (split.length < 2) return { providerId: currentProvider, model: normalizeModel(currentProvider, trimmed) }
  const first = split[0]
  const rest = split[1]
  if (!first || !rest) return undefined
  return { providerId: first, model: normalizeModel(first, rest) }
}

export function normalizeModel(providerId: string, model: string) {
  if (providerId === 'nvidia' && !model.includes('/')) return `nvidia/${model}`
  return model
}
