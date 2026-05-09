import { OpenDeepConfig, ProviderAdapter, ProviderConfig } from '../types.js'
import { OpenAICompatibleAdapter } from './openaiCompatible.js'
import { AnthropicAdapter } from './anthropic.js'
import { GeminiAdapter } from './gemini.js'

export const BUILTIN_PROVIDERS: ProviderConfig[] = [
  { id: 'openai', name: 'OpenAI', kind: 'openai-compatible', baseUrl: 'https://api.openai.com/v1', apiKeyEnv: 'OPENAI_API_KEY', modelEnv: 'OPENAI_MODEL', defaultModel: 'gpt-4o-mini' },
  { id: 'anthropic', name: 'Anthropic Claude', kind: 'anthropic', apiKeyEnv: 'ANTHROPIC_API_KEY', modelEnv: 'ANTHROPIC_MODEL', defaultModel: 'claude-3-5-sonnet-latest' },
  { id: 'gemini', name: 'Google Gemini', kind: 'gemini', apiKeyEnv: 'GEMINI_API_KEY', modelEnv: 'GEMINI_MODEL', defaultModel: 'gemini-2.5-flash' },
  { id: 'openrouter', name: 'OpenRouter', kind: 'openai-compatible', baseUrl: 'https://openrouter.ai/api/v1', apiKeyEnv: 'OPENROUTER_API_KEY', modelEnv: 'OPENROUTER_MODEL', defaultModel: 'openai/gpt-4o-mini' },
  { id: 'nvidia', name: 'NVIDIA NIM', kind: 'openai-compatible', baseUrl: 'https://integrate.api.nvidia.com/v1', apiKeyEnv: 'NVIDIA_API_KEY', modelEnv: 'NVIDIA_MODEL', defaultModel: 'nvidia/llama-3.3-nemotron-super-49b-v1.5' },
  { id: 'deepseek', name: 'DeepSeek', kind: 'openai-compatible', baseUrl: 'https://api.deepseek.com/v1', apiKeyEnv: 'DEEPSEEK_API_KEY', modelEnv: 'DEEPSEEK_MODEL', defaultModel: 'deepseek-chat' },
  { id: 'groq', name: 'Groq', kind: 'openai-compatible', baseUrl: 'https://api.groq.com/openai/v1', apiKeyEnv: 'GROQ_API_KEY', modelEnv: 'GROQ_MODEL', defaultModel: 'llama-3.3-70b-versatile' },
  { id: 'mistral', name: 'Mistral', kind: 'openai-compatible', baseUrl: 'https://api.mistral.ai/v1', apiKeyEnv: 'MISTRAL_API_KEY', modelEnv: 'MISTRAL_MODEL', defaultModel: 'mistral-large-latest' },
  { id: 'xai', name: 'xAI', kind: 'openai-compatible', baseUrl: 'https://api.x.ai/v1', apiKeyEnv: 'XAI_API_KEY', modelEnv: 'XAI_MODEL', defaultModel: 'grok-2-latest' },
  { id: 'perplexity', name: 'Perplexity', kind: 'openai-compatible', baseUrl: 'https://api.perplexity.ai', apiKeyEnv: 'PPLX_API_KEY', modelEnv: 'PPLX_MODEL', defaultModel: 'sonar' },
  { id: 'together', name: 'Together AI', kind: 'openai-compatible', baseUrl: 'https://api.together.xyz/v1', apiKeyEnv: 'TOGETHER_API_KEY', modelEnv: 'TOGETHER_MODEL', defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo' },
  { id: 'fireworks', name: 'Fireworks', kind: 'openai-compatible', baseUrl: 'https://api.fireworks.ai/inference/v1', apiKeyEnv: 'FIREWORKS_API_KEY', modelEnv: 'FIREWORKS_MODEL', defaultModel: 'accounts/fireworks/models/llama-v3p1-70b-instruct' },
  { id: 'ollama', name: 'Ollama', kind: 'openai-compatible', baseUrl: 'http://localhost:11434/v1', modelEnv: 'OLLAMA_MODEL', defaultModel: 'llama3.2' },
  { id: 'lmstudio', name: 'LM Studio', kind: 'openai-compatible', baseUrl: 'http://localhost:1234/v1', modelEnv: 'LMSTUDIO_MODEL', defaultModel: 'local-model' },
  { id: 'github-models', name: 'GitHub Models', kind: 'openai-compatible', baseUrl: 'https://models.inference.ai.azure.com', apiKeyEnv: 'GITHUB_TOKEN', modelEnv: 'GITHUB_MODELS_MODEL', defaultModel: 'gpt-4o-mini' },
  { id: 'bedrock', name: 'Amazon Bedrock', kind: 'placeholder', modelEnv: 'BEDROCK_MODEL', defaultModel: 'anthropic.claude-3-5-sonnet-20240620-v1:0', notes: 'Registered for config compatibility; SDK adapter planned.' },
  { id: 'vertex', name: 'Google Vertex AI', kind: 'placeholder', modelEnv: 'VERTEX_MODEL', defaultModel: 'gemini-2.5-flash', notes: 'Registered for config compatibility; SDK adapter planned.' },
  { id: 'foundry', name: 'Anthropic Foundry', kind: 'placeholder', modelEnv: 'FOUNDRY_MODEL', defaultModel: 'claude-sonnet-4-5', notes: 'Registered for config compatibility; SDK adapter planned.' },
  { id: 'codex', name: 'OpenAI Codex', kind: 'openai-compatible', baseUrl: 'https://api.openai.com/v1', apiKeyEnv: 'CODEX_API_KEY', modelEnv: 'CODEX_MODEL', defaultModel: 'gpt-5.5' },
  { id: 'codex-oauth', name: 'Codex Local Login', kind: 'openai-compatible', baseUrl: 'https://api.openai.com/v1', apiKeyEnv: 'CODEX_OAUTH_TOKEN', modelEnv: 'CODEX_MODEL', defaultModel: 'gpt-5.5', notes: 'Uses an imported local Codex/OpenAI credential when available.' },
]

export function mergeProviderConfig(base: ProviderConfig, config: OpenDeepConfig): ProviderConfig {
  return { ...base, ...config.providers[base.id], id: base.id, name: config.providers[base.id]?.name ?? base.name, kind: config.providers[base.id]?.kind ?? base.kind, defaultModel: config.providers[base.id]?.defaultModel ?? base.defaultModel }
}

export function getProviderConfigs(config: OpenDeepConfig) {
  return BUILTIN_PROVIDERS.map((provider) => mergeProviderConfig(provider, config))
}

export function createProvider(id: string, config: OpenDeepConfig): ProviderAdapter {
  const provider = getProviderConfigs(config).find((item) => item.id === id)
  if (!provider) throw new Error(`Unknown provider: ${id}`)
  if (provider.kind === 'anthropic') return new AnthropicAdapter(provider)
  if (provider.kind === 'gemini') return new GeminiAdapter(provider)
  if (provider.kind === 'openai-compatible') return new OpenAICompatibleAdapter(provider)
  throw new Error(`${provider.name} is registered but not implemented yet. ${provider.notes ?? ''}`.trim())
}

export function resolveModel(provider: ProviderConfig) {
  if (provider.modelEnv && process.env[provider.modelEnv]) return process.env[provider.modelEnv]
  return provider.defaultModel
}
