import test from 'node:test'
import assert from 'node:assert/strict'
import { BUILTIN_AGENTS } from '../agents/agents.js'
import { BUILTIN_TOOLS } from '../tools/registry.js'

test('agent tool ids exist in registry', () => {
  const ids = new Set(BUILTIN_TOOLS.map((tool) => tool.id))
  for (const agent of BUILTIN_AGENTS) {
    for (const tool of agent.tools ?? []) assert.ok(ids.has(tool), `${agent.name} references missing tool ${tool}`)
  }
})
