import OpenAI from 'openai'
import { ChatRequest, ProviderAdapter, ProviderConfig, ChatMessage } from '../types.js'
import { getSecret } from '../security/secrets.js'

function toOpenAIMessages(messages: ChatMessage[]) {
  return messages.map((message) => ({ role: message.role === 'tool' ? 'user' : message.role, content: message.content })) as Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
}

function requestBody(request: ChatRequest) {
  return {
    model: request.model,
    messages: toOpenAIMessages(request.messages),
    ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
    ...(request.maxTokens === undefined ? {} : { max_tokens: request.maxTokens }),
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
    return models.data.map((model) => ({ id: model.id, name: model.id, supportsStreaming: true }))
  }
}
