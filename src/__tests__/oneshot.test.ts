import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runPromptWithProvider } from '../chat/chat.js'
import { DEFAULT_CONFIG } from '../config/config.js'
import { ChatResponse, ProviderAdapter } from '../types.js'

const originalCwd = process.cwd()

class OneShotProvider implements ProviderAdapter {
  config = { id: 'openai', name: 'Fake', kind: 'openai-compatible' as const, defaultModel: 'fake' }
  usedTools = false
  async complete(): Promise<string> { return 'text only' }
  async *stream(): AsyncIterable<string> { yield 'text only' }
  async completeWithTools(): Promise<ChatResponse> {
    this.usedTools = true
    return { content: 'tool path' }
  }
}

test('one-shot runPrompt uses provider tool-calling path', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'opendeep-oneshot-'))
  try {
    process.chdir(dir)
    const provider = new OneShotProvider()
    await runPromptWithProvider('use tools', { ...DEFAULT_CONFIG, defaultProvider: 'openai', defaultModel: 'fake' }, provider)
    assert.equal(provider.usedTools, true)
  } finally {
    process.chdir(originalCwd)
    await rm(dir, { recursive: true, force: true })
  }
})
