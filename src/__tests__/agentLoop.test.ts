import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runAgentTurn, toolsForAgent } from '../chat/agentLoop.js'
import { DEFAULT_CONFIG } from '../config/config.js'
import { ProviderAdapter, ChatResponse, ChatRuntimeState } from '../types.js'

class FakeToolProvider implements ProviderAdapter {
  config = { id: 'fake', name: 'Fake', kind: 'openai-compatible' as const, defaultModel: 'fake' }
  calls = 0
  async complete(): Promise<string> { return 'fallback' }
  async *stream(): AsyncIterable<string> { yield 'fallback' }
  async completeWithTools(): Promise<ChatResponse> {
    this.calls += 1
    if (this.calls === 1) return { content: '', toolCalls: [{ id: 'call_1', name: 'glob', arguments: { pattern: '*.txt' } }] }
    return { content: 'Encontrei arquivos.' }
  }
}

class InfiniteToolProvider extends FakeToolProvider {
  override async completeWithTools(): Promise<ChatResponse> {
    this.calls += 1
    return { content: '', toolCalls: [{ id: `call_${this.calls}`, name: 'glob', arguments: { pattern: '*.txt' } }] }
  }
}

class ToolChoiceFailProvider implements ProviderAdapter {
  config = { id: 'tool-choice-fail', name: 'Tool choice fail', kind: 'openai-compatible' as const, defaultModel: 'fake' }
  async complete(): Promise<string> { return 'fallback after tool choice failure' }
  async *stream(): AsyncIterable<string> { yield 'fallback after tool choice failure' }
  async completeWithTools(): Promise<ChatResponse> { throw new Error('400 "auto" tool choice requires --enable-auto-tool-choice and --tool-call-parser to be set') }
}

class TextCommandProvider implements ProviderAdapter {
  config = { id: 'text-command', name: 'Text command', kind: 'openai-compatible' as const, defaultModel: 'fake' }
  calls = 0
  async complete(): Promise<string> { return 'fallback' }
  async *stream(): AsyncIterable<string> { yield 'fallback' }
  async completeWithTools(): Promise<ChatResponse> {
    this.calls += 1
    if (this.calls === 1) {
      return { content: JSON.stringify({ cmd: 'node -e "require(\\"fs\\").writeFileSync(\\"created-by-text-command.txt\\", \\"ok\\")"' }) }
    }
    return { content: 'Arquivo criado.' }
  }
}

class FallbackProvider implements ProviderAdapter {
  config = { id: 'fallback', name: 'Fallback', kind: 'placeholder' as const, defaultModel: 'fallback' }
  async complete(): Promise<string> { return 'fallback text' }
  async *stream(): AsyncIterable<string> { yield 'fallback text' }
}

async function makeState(): Promise<{ state: ChatRuntimeState; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), 'opendeep-agent-'))
  await writeFile(join(dir, 'a.txt'), 'hello')
  const state: ChatRuntimeState = {
    providerId: 'fake',
    model: 'fake',
    agent: 'plan',
    project: { id: `test-${Date.now()}`, name: 'tmp', path: dir, updatedAt: new Date().toISOString() },
    session: { id: `session-${Date.now()}`, title: 'test', projectPath: dir, provider: 'fake', model: 'fake', agent: 'plan', messages: [{ role: 'user', content: 'list txt files' }], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  }
  return { state, cleanup: () => rm(dir, { recursive: true, force: true }) }
}

test('toolsForAgent filters registered tools', () => {
  assert.deepEqual(toolsForAgent('plan').map((tool) => tool.id).sort(), ['git_diff', 'git_log', 'git_status', 'glob', 'grep', 'list', 'read'])
  assert.ok(toolsForAgent('general').some((tool) => tool.id === 'bash'))
})

test('agent loop executes tool calls and persists results', async () => {
  const { state, cleanup } = await makeState()
  try {
    const provider = new FakeToolProvider()
    const answer = await runAgentTurn({ state, config: DEFAULT_CONFIG, provider })
    assert.equal(answer, 'Encontrei arquivos.')
    assert.equal(provider.calls, 2)
    assert.equal(state.session.messages.some((message) => message.role === 'tool' && message.name === 'glob'), true)
    assert.equal(state.session.messages.at(-1)?.role, 'assistant')
  } finally {
    await cleanup()
  }
})

test('agent loop falls back for providers without tools', async () => {
  const { state, cleanup } = await makeState()
  try {
    const answer = await runAgentTurn({ state, config: { ...DEFAULT_CONFIG, ui: { ...DEFAULT_CONFIG.ui, stream: false } }, provider: new FallbackProvider() })
    assert.equal(answer, 'fallback text')
    assert.equal(state.session.messages.at(-1)?.content, 'fallback text')
  } finally {
    await cleanup()
  }
})

test('agent loop falls back when provider rejects auto tool choice', async () => {
  const { state, cleanup } = await makeState()
  try {
    const answer = await runAgentTurn({ state, config: { ...DEFAULT_CONFIG, ui: { ...DEFAULT_CONFIG.ui, stream: false } }, provider: new ToolChoiceFailProvider() })
    assert.equal(answer, 'fallback after tool choice failure')
  } finally {
    await cleanup()
  }
})

test('agent loop executes textual cmd JSON returned by Codex-style providers', async () => {
  const { state, cleanup } = await makeState()
  try {
    state.session.messages = [{ role: 'user', content: 'crie um arquivo created-by-text-command.txt' }]
    const provider = new TextCommandProvider()
    const answer = await runAgentTurn({
      state,
      config: { ...DEFAULT_CONFIG, permissions: { ...DEFAULT_CONFIG.permissions, allowAll: true } },
      provider,
    })

    assert.equal(answer, 'Arquivo criado.')
    assert.equal(provider.calls, 2)
    assert.equal(await readFile(join(state.project.path, 'created-by-text-command.txt'), 'utf8'), 'ok')
    assert.equal(state.session.messages.some((message) => message.role === 'tool' && message.name === 'bash'), true)
  } finally {
    await cleanup()
  }
})

test('agent loop stops after max iterations', async () => {
  const { state, cleanup } = await makeState()
  try {
    const provider = new InfiniteToolProvider()
    const answer = await runAgentTurn({ state, config: DEFAULT_CONFIG, provider })
    assert.match(answer, /Agent loop stopped/)
    assert.equal(provider.calls, 8)
  } finally {
    await cleanup()
  }
})
