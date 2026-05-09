import test from 'node:test'
import assert from 'node:assert/strict'
import { formatToolList, getTool, listTools } from '../tools/registry.js'

test('tool registry exposes core file tools', () => {
  const ids = listTools().map((tool) => tool.id)
  for (const id of ['read', 'glob', 'grep', 'edit', 'write', 'bash']) assert.ok(ids.includes(id), `missing ${id}`)
})

test('tool registry formats tools', () => {
  assert.ok(getTool('edit'))
  assert.match(formatToolList(), /edit/)
})
