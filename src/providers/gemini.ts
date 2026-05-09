import { GoogleGenAI } from '@google/genai'
import { ChatRequest, ProviderAdapter, ProviderConfig } from '../types.js'
import { getSecret } from '../security/secrets.js'

export class GeminiAdapter implements ProviderAdapter {
  constructor(public readonly config: ProviderConfig) {}

  private async client() {
    const apiKey = this.config.apiKeyEnv ? await getSecret(this.config.apiKeyEnv) : undefined
    return new GoogleGenAI(apiKey ? { apiKey } : {})
  }

  private prompt(request: ChatRequest) {
    return request.messages.map((message) => `${message.role.toUpperCase()}: ${message.content}`).join('\n\n')
  }

  async complete(request: ChatRequest) {
    const client = await this.client()
    const response = await client.models.generateContent({ model: request.model, contents: this.prompt(request) })
    return response.text ?? ''
  }

  async *stream(request: ChatRequest) {
    const client = await this.client()
    const stream = await client.models.generateContentStream({ model: request.model, contents: this.prompt(request) })
    for await (const chunk of stream) {
      if (chunk.text) yield chunk.text
    }
  }
}
