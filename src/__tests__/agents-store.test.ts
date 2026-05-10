import test from 'node:test'
import assert from 'node:assert/strict'
import { formatAgentList, listAgents, validateAgentLimit } from '../agents/agents.js'

test('agents list always exposes at least the 3 built-in collaborative agents', () => {
  const agents = listAgents()
  assert.ok(agents.length >= 3)
  assert.ok(agents.some((agent) => agent.name === 'plan'))
  assert.ok(agents.some((agent) => agent.name === 'build'))
  assert.ok(agents.some((agent) => agent.name === 'general'))
})

test('agent limit allows up to 12 agents and blocks the 13th', () => {
  assert.doesNotThrow(() => validateAgentLimit(11, false))
  assert.doesNotThrow(() => validateAgentLimit(12, true))
  assert.throws(() => validateAgentLimit(12, false), /máximo de 12 agentes/i)
})

test('agent list renders model when an agent has its own model override', () => {
  const rendered = formatAgentList([
    { name: 'frontend', description: 'UI specialist', systemPrompt: 'Build UI', model: 'openai/gpt-5' },
  ])
  assert.match(rendered, /frontend/)
  assert.match(rendered, /UI specialist/)
  assert.match(rendered, /openai\/gpt-5/)
})
