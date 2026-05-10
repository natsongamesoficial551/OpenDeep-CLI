import OpenAI from 'openai'
import { ChatRequest, ProviderAdapter, ProviderConfig, ChatMessage, ToolSpec, ToolCall } from '../types.js'
import { getSecret } from '../security/secrets.js'
import { getCodexOAuthAccessToken, getCodexOAuthCredentials } from '../auth/auth.js'


async function ensureImportedCodexLocalAuth() {
  const imported = await import('../importers/importers.js')
  await imported.importCodexLocalAuth()
}

function toOpenAIMessages(messages: ChatMessage[]) {
  return messages.map((message) => ({ role: message.role === 'tool' ? 'user' : message.role, content: message.content })) as Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
}

function toOpenAIToolAwareMessages(messages: ChatMessage[]) {
  return messages.map((message) => {
    if (message.role === 'tool') {
      return {
        role: 'tool' as const,
        tool_call_id: message.toolCallId ?? message.name ?? 'unknown_tool_call',
        content: message.content,
      }
    }
    if (message.role === 'assistant' && message.toolCalls?.length) {
      return {
        role: 'assistant' as const,
        content: message.content || null,
        tool_calls: message.toolCalls.map((call) => ({
          id: call.id,
          type: 'function' as const,
          function: {
            name: call.name,
            arguments: typeof call.arguments === 'string' ? call.arguments : JSON.stringify(call.arguments ?? {}),
          },
        })),
      }
    }
    return { role: message.role as 'system' | 'user' | 'assistant', content: message.content }
  })
}

function toOpenAITools(tools?: ToolSpec[]) {
  return tools?.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  }))
}

function parseToolCall(call: OpenAI.Chat.Completions.ChatCompletionMessageToolCall): ToolCall {
  if (call.type !== 'function') {
    return { id: call.id, name: 'unsupported_tool', arguments: {}, rawArguments: '', parseError: `Unsupported tool call type: ${call.type}` }
  }
  const rawArguments = call.function.arguments || '{}'
  try {
    return { id: call.id, name: call.function.name, arguments: JSON.parse(rawArguments), rawArguments }
  } catch (error) {
    return {
      id: call.id,
      name: call.function.name,
      arguments: {},
      rawArguments,
      parseError: error instanceof Error ? error.message : String(error),
    }
  }
}

function requestBody(request: ChatRequest) {
  return {
    model: request.model,
    messages: toOpenAIMessages(request.messages),
    ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
    ...(request.maxTokens === undefined ? {} : { max_tokens: request.maxTokens }),
  }
}

function toolRequestBody(request: ChatRequest) {
  const tools = toOpenAITools(request.tools)
  return {
    model: request.model,
    messages: toOpenAIToolAwareMessages(request.messages),
    ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
    ...(request.maxTokens === undefined ? {} : { max_tokens: request.maxTokens }),
    ...(tools?.length ? { tools, tool_choice: request.toolChoice ?? 'auto' as const } : {}),
  }
}

function toCodexInput(messages: ChatMessage[]) {
  return messages.map((message) => {
    const role = message.role === 'assistant' ? 'assistant' : 'user'
    const textType = role === 'assistant' ? 'output_text' as const : 'input_text' as const
    return {
      type: 'message' as const,
      role,
      content: [{ type: textType, text: message.content }],
    }
  })
}

function codexInstructions(messages: ChatMessage[]) {
  return messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n\n')
}

function extractResponsesText(response: unknown) {
  const typed = response as { output_text?: unknown; output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string; refusal?: string }> }> }
  if (typeof typed.output_text === 'string') return typed.output_text
  return typed.output?.flatMap((item) => item.content ?? []).map((part) => part.text ?? part.refusal ?? '').join('') ?? ''
}

function isResponsesOutputEvent(event: unknown) {
  const type = (event as { type?: unknown }).type
  return type === 'response.output_text.delta' || type === 'response.refusal.delta'
}

function responsesDelta(event: unknown) {
  const delta = (event as { delta?: unknown }).delta
  return typeof delta === 'string' ? delta : ''
}

type SseEvent = { event: string; data?: Record<string, any> }

async function* readSseEvents(response: Response): AsyncGenerator<SseEvent> {
  const reader = response.body?.getReader()
  if (!reader) return
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const chunks = buffer.split('\n\n')
    buffer = chunks.pop() ?? ''
    for (const chunk of chunks) {
      const lines = chunk.split('\n').map((line) => line.trim()).filter(Boolean)
      const eventLine = lines.find((line) => line.startsWith('event: '))
      const dataLines = lines.filter((line) => line.startsWith('data: '))
      if (!eventLine || !dataLines.length) continue
      const event = eventLine.slice('event: '.length)
      const rawData = dataLines.map((line) => line.slice('data: '.length)).join('\n')
      let data: Record<string, any> | undefined
      try {
        const parsed = JSON.parse(rawData)
        if (parsed && typeof parsed === 'object') data = parsed
      } catch {}
      if (data) yield { event, data }
      else yield { event }
    }
  }
}

function codexUnsupportedParams() {
  return new Set(['max_output_tokens', 'metadata', 'prompt_cache_retention', 'service_tier', 'temperature'])
}

function sanitizeCodexPayload<T extends Record<string, unknown>>(payload: T) {
  for (const key of codexUnsupportedParams()) delete payload[key]
  return payload
}

function codexResponsesBody(request: ChatRequest) {
  const instructions = codexInstructions(request.messages)
  const payload = {
    model: request.model,
    input: toCodexInput(request.messages.filter((message) => message.role !== 'system')),
    ...(instructions ? { instructions } : {}),
    ...(request.maxTokens === undefined ? {} : { max_output_tokens: request.maxTokens }),
    store: false,
  }
  return sanitizeCodexPayload(payload)
}

export class OpenAICompatibleAdapter implements ProviderAdapter {
  constructor(public readonly config: ProviderConfig) {}

  private isCodexOAuth() {
    return this.config.id === 'codex-oauth'
  }

  private async client() {
    let apiKey = this.config.apiKeyEnv ? await getSecret(this.config.apiKeyEnv) : undefined
    if (this.isCodexOAuth()) {
      apiKey = await getCodexOAuthAccessToken()
      if (!apiKey) {
        await ensureImportedCodexLocalAuth()
        apiKey = await getCodexOAuthAccessToken()
      }
      if (!apiKey) {
        throw new Error('Codex OAuth não configurado. Rode /login codex-oauth (ou comando "codex") para autenticar via navegador.')
      }
    }
    return new OpenAI({
      apiKey: apiKey ?? 'not-required',
      baseURL: this.config.baseUrl,
      defaultHeaders: this.config.headers,
    })
  }

  private async codexCredentials() {
    let credentials
    try {
      credentials = await getCodexOAuthCredentials()
    } catch {
      await ensureImportedCodexLocalAuth()
      credentials = await getCodexOAuthCredentials()
    }
    if (!credentials.apiKey || !credentials.accountId) {
      await ensureImportedCodexLocalAuth()
      credentials = await getCodexOAuthCredentials()
    }
    if (!credentials.apiKey) {
      throw new Error('Codex OAuth não configurado. Rode /login codex-oauth (ou comando "codex") para autenticar via navegador.')
    }
    if (!credentials.accountId) {
      throw new Error('Codex OAuth sem chatgpt_account_id. Rode deepcode codex novamente para refazer o login.')
    }
    return credentials
  }

  private async codexResponsesClient() {
    const credentials = await this.codexCredentials()
    return new OpenAI({
      apiKey: credentials.apiKey,
      baseURL: 'https://chatgpt.com/backend-api/codex',
      defaultHeaders: {
        Authorization: `Bearer ${credentials.apiKey}`,
        'chatgpt-account-id': credentials.accountId!,
        originator: 'deepcode',
        'User-Agent': 'deepcode',
      },
    })
  }

  private async codexPostResponse(request: ChatRequest, stream: boolean) {
    const credentials = await this.codexCredentials()
    const response = await fetch('https://chatgpt.com/backend-api/codex/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${credentials.apiKey}`,
        'chatgpt-account-id': credentials.accountId!,
        originator: 'deepcode',
        'User-Agent': 'deepcode',
      },
      body: JSON.stringify({ ...codexResponsesBody(request), stream }),
      ...(request.signal ? { signal: request.signal } : {}),
    })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(body.trim() ? `Codex API error ${response.status}: ${body.trim()}` : `Codex API error ${response.status}`)
    }
    return response
  }

  private async codexComplete(request: ChatRequest) {
    const response = await this.codexPostResponse(request, true)
    let answer = ''
    for await (const event of readSseEvents(response)) {
      if (event.event === 'response.output_text.delta') {
        const delta = typeof event.data?.delta === 'string' ? event.data.delta : ''
        answer += delta
      }
      if (event.event === 'response.failed') {
        const message = event.data?.response?.error?.message ?? event.data?.error?.message ?? 'Codex response failed'
        throw new Error(String(message))
      }
    }
    return answer
  }

  private async *codexStream(request: ChatRequest) {
    const response = await this.codexPostResponse(request, true)
    for await (const event of readSseEvents(response)) {
      if (event.event === 'response.output_text.delta') {
        const delta = typeof event.data?.delta === 'string' ? event.data.delta : ''
        if (delta) yield delta
      }
      if (event.event === 'response.failed') {
        const message = event.data?.response?.error?.message ?? event.data?.error?.message ?? 'Codex response failed'
        throw new Error(String(message))
      }
    }
  }

  async complete(request: ChatRequest) {
    if (this.isCodexOAuth()) {
      return this.codexComplete(request)
    }
    const client = await this.client()
    const response = await client.chat.completions.create(requestBody(request))
    return response.choices[0]?.message?.content ?? ''
  }

  async completeWithTools(request: ChatRequest) {
    if (this.isCodexOAuth()) {
      return { content: await this.complete(request) }
    }
    const client = await this.client()
    const response = await client.chat.completions.create(toolRequestBody(request))
    const message = response.choices[0]?.message
    return {
      content: message?.content ?? '',
      toolCalls: message?.tool_calls?.map(parseToolCall),
    }
  }

  async *stream(request: ChatRequest) {
    if (this.isCodexOAuth()) {
      yield* this.codexStream(request)
      return
    }
    const client = await this.client()
    const stream = await client.chat.completions.create({ ...requestBody(request), stream: true })
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content
      if (content) yield content
    }
  }

  async listModels() {
    if (this.isCodexOAuth()) return [
      { id: 'gpt-5.5', name: 'gpt-5.5', supportsStreaming: true, supportsTools: false },
      { id: 'gpt-5.3-codex', name: 'gpt-5.3-codex', supportsStreaming: true, supportsTools: false },
    ]
    const client = await this.client()
    const models = await client.models.list()
    return models.data.map((model) => ({ id: model.id, name: model.id, supportsStreaming: true, supportsTools: true }))
  }
}
