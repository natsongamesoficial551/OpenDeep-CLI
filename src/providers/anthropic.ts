import Anthropic from '@anthropic-ai/sdk'
import { ChatRequest, ProviderAdapter, ProviderConfig } from '../types.js'
import { getSecret } from '../security/secrets.js'

export class AnthropicAdapter implements ProviderAdapter {
  constructor(public readonly config: ProviderConfig) {}

  private async client() {
    const apiKey = this.config.apiKeyEnv ? await getSecret(this.config.apiKeyEnv) : undefined
    return new Anthropic({ apiKey: apiKey ?? undefined })
  }

  private splitMessages(request: ChatRequest) {
    const system = request.messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n\n') || undefined
    const messages = request.messages.filter((message) => message.role !== 'system').map((message) => ({
      role: message.role === 'assistant' ? 'assistant' as const : 'user' as const,
      content: message.content,
    }))
    return { system, messages }
  }

  private body(request: ChatRequest) {
    const body = this.splitMessages(request)
    return {
      model: request.model,
      max_tokens: request.maxTokens ?? 4096,
      messages: body.messages,
      ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
      ...(body.system === undefined ? {} : { system: body.system }),
    }
  }

  async complete(request: ChatRequest) {
    const client = await this.client()
    const response = await client.messages.create(this.body(request))
    return response.content.map((block) => block.type === 'text' ? block.text : '').join('')
  }

  async *stream(request: ChatRequest) {
    const client = await this.client()
    const stream = await client.messages.create({ ...this.body(request), stream: true })
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') yield event.delta.text
    }
  }
}
