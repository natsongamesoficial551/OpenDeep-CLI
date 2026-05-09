export type Role = 'system' | 'user' | 'assistant' | 'tool'

export interface ChatMessage {
  role: Role
  content: string
  name?: string
}

export interface ChatRequest {
  messages: ChatMessage[]
  model: string
  temperature?: number
  maxTokens?: number
  signal?: AbortSignal
}

export interface ProviderModel {
  id: string
  name?: string
  contextWindow?: number
  supportsTools?: boolean
  supportsStreaming?: boolean
}

export interface ProviderConfig {
  id: string
  name: string
  kind: 'openai-compatible' | 'anthropic' | 'gemini' | 'placeholder'
  baseUrl?: string | undefined
  apiKeyEnv?: string | undefined
  modelEnv?: string | undefined
  defaultModel: string
  headers?: Record<string, string> | undefined
  notes?: string | undefined
}

export interface ProviderAdapter {
  config: ProviderConfig
  complete(request: ChatRequest): Promise<string>
  stream(request: ChatRequest): AsyncIterable<string>
  listModels?(): Promise<ProviderModel[]>
}

export interface ProviderProfile {
  provider: string
  model: string
  baseUrl?: string | undefined
  apiKeyEnv?: string | undefined
}

type ProviderConfigOverride = {
  id?: string | undefined
  name?: string | undefined
  kind?: ProviderConfig['kind'] | undefined
  baseUrl?: string | undefined
  apiKeyEnv?: string | undefined
  modelEnv?: string | undefined
  defaultModel?: string | undefined
  headers?: Record<string, string> | undefined
  notes?: string | undefined
  apiKey?: string | undefined
}

export interface OpenDeepConfig {
  defaultProvider: string
  defaultModel: string
  providers: Record<string, ProviderConfigOverride>
  permissions: {
    autoAllow: boolean
    allowShell: boolean
    allowWrite: boolean
    allowNetwork: boolean
  }
  ui: {
    stream: boolean
    color: boolean
  }
}
