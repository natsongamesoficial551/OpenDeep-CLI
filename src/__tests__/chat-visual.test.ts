import test from 'node:test'
import assert from 'node:assert/strict'
import stripAnsi from 'strip-ansi'
import { createInputDraft, renderChatInputLines } from '../chat/chat.js'
import { renderTaskLine } from '../ui/taskTracker.js'

test('chat input renders status above a bordered input bubble', () => {
  const draft = createInputDraft()
  draft.buffer = 'Criar SaaS completo'

  const rendered = stripAnsi(renderChatInputLines({
    draft,
    providerId: 'codex-oauth',
    model: 'gpt-5.5',
    agent: 'general',
    taskCount: 3,
    elapsedMs: 12_345,
    width: 72,
  }).join('\n'))

  assert.match(rendered, /IA pronta/)
  assert.match(rendered, /tasks 3/)
  assert.match(rendered, /tempo 12\.3s/)
  assert.match(rendered, /codex-oauth\/gpt-5\.5/)
  assert.match(rendered, /╭─ Você/)
  assert.match(rendered, /│ › Criar SaaS completo/)
  assert.match(rendered, /╰─+/)
})

test('chat input renderer returns flat physical lines so redraw can clear everything', () => {
  const draft = createInputDraft()
  draft.buffer = 'Olá tudo bem'

  const lines = renderChatInputLines({
    draft,
    providerId: 'codex-oauth',
    model: 'gpt-5.5',
    agent: 'general',
    taskCount: 0,
    elapsedMs: 147_000,
    width: 72,
  })

  assert.equal(lines.length, 4)
  assert.ok(lines.every((line) => !stripAnsi(line).includes('\n')))
})

test('task status line can show provider and model without becoming a bubble', () => {
  const rendered = stripAnsi(renderTaskLine({
    label: 'Escrevendo index.html',
    toolName: 'write',
    status: 'done',
    durationMs: 2345,
    providerId: 'codex-oauth',
    model: 'gpt-5.5',
    taskIndex: 4,
  }, 90))

  assert.match(rendered, /^✓ \[4\] Escrevendo index\.html/)
  assert.match(rendered, /write/)
  assert.match(rendered, /2\.3s/)
  assert.match(rendered, /codex-oauth\/gpt-5\.5/)
  assert.doesNotMatch(rendered, /╭─|│|╰─/)
})
