import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runPromptWithProvider } from '../chat/chat.js'
import { DEFAULT_CONFIG } from '../config/config.js'
import { ChatResponse, ProviderAdapter } from '../types.js'
import { AgentEvent, formatAgentEventJsonl } from '../core/agentEvents.js'
import { loadSessionEvents } from '../sessions/sessionStore.js'

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

test('one-shot runPrompt can collect JSONL-ready structured runtime events', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'opendeep-oneshot-events-'))
  try {
    process.chdir(dir)
    const events: AgentEvent[] = []
    const provider = new OneShotProvider()
    await runPromptWithProvider('use tools', { ...DEFAULT_CONFIG, defaultProvider: 'openai', defaultModel: 'fake' }, provider, {
      persistEvents: true,
      onEvent: (event) => { events.push(event) },
    })

    assert.equal(provider.usedTools, true)
    assert.deepEqual(events.map((event) => event.type), ['turn.started', 'assistant.message', 'turn.completed'])
    const jsonl = events.map(formatAgentEventJsonl).join('')
    assert.equal(jsonl.trim().split('\n').length, 3)
    assert.match(jsonl, /"type":"turn\.started"/)
    assert.match(jsonl, /"type":"turn\.completed"/)
    const persisted = await loadSessionEvents(events[0]!.sessionId)
    assert.deepEqual(persisted.map((event) => event.type), events.map((event) => event.type))
  } finally {
    process.chdir(originalCwd)
    await rm(dir, { recursive: true, force: true })
  }
})
