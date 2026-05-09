import OpenAI from 'openai'
import { ChatRequest, ProviderAdapter, ProviderConfig, ChatMessage, ToolSpec, ToolCall } from '../types.js'
import { getSecret } from '../security/secrets.js'

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

export class OpenAICompatibleAdapter implements ProviderAdapter {
  constructor(public readonly config: ProviderConfig) {}

  private async client() {
    const apiKey = this.config.apiKeyEnv ? await getSecret(this.config.apiKeyEnv) : undefined
    return new OpenAI({
      apiKey: apiKey ?? 'not-required',
      baseURL: this.config.baseUrl,
      defaultHeaders: this.config.headers,
    })
  }

  async complete(request: ChatRequest) {
    const client = await this.client()
    const response = await client.chat.completions.create(requestBody(request))
    return response.choices[0]?.message?.content ?? ''
  }

  async completeWithTools(request: ChatRequest) {
    const client = await this.client()
    const response = await client.chat.completions.create(toolRequestBody(request))
    const message = response.choices[0]?.message
    return {
      content: message?.content ?? '',
      toolCalls: message?.tool_calls?.map(parseToolCall),
    }
  }

  async *stream(request: ChatRequest) {
    const client = await this.client()
    const stream = await client.chat.completions.create({ ...requestBody(request), stream: true })
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content
      if (content) yield content
    }
  }

  async listModels() {
    const client = await this.client()
    const models = await client.models.list()
    return models.data.map((model) => ({ id: model.id, name: model.id, supportsStreaming: true, supportsTools: true }))
  }
}
