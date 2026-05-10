export type Role = 'system' | 'user' | 'assistant' | 'tool'

export interface ToolSpec {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface ToolCall {
  id: string
  name: string
  arguments: unknown
  rawArguments?: string | undefined
  parseError?: string | undefined
}

export interface ChatResponse {
  content: string
  toolCalls?: ToolCall[] | undefined
}

export interface ChatMessage {
  role: Role
  content: string
  name?: string | undefined
  toolCallId?: string | undefined
  toolCalls?: ToolCall[] | undefined
  metadata?: Record<string, unknown> | undefined
}

export interface ChatRequest {
  messages: ChatMessage[]
  model: string
  temperature?: number
  maxTokens?: number
  signal?: AbortSignal
  tools?: ToolSpec[] | undefined
  toolChoice?: 'auto' | 'none' | undefined
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
  completeWithTools?(request: ChatRequest): Promise<ChatResponse>
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
    allowAll: boolean
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

export interface SessionRecord {
  id: string
  title: string
  projectPath: string
  provider: string
  model: string
  agent?: string | undefined
  messages: ChatMessage[]
  createdAt: string
  updatedAt: string
}

export interface ProjectRecord {
  id: string
  name: string
  path: string
  lastSessionId?: string | undefined
  updatedAt: string
}

export interface ChatRuntimeState {
  providerId: string
  model: string
  agent: string
  project: ProjectRecord
  session: SessionRecord
}

export interface SlashCommand {
  name: string
  aliases?: string[]
  usage: string
  description: string
  category: 'Core' | 'Provider' | 'Model' | 'Agent' | 'Project' | 'Session' | 'Config' | 'Tools' | 'Permissions'
  template?: string
}
