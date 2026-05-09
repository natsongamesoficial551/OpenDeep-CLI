import test from 'node:test'
import assert from 'node:assert/strict'
import { BUILTIN_TOOLS } from '../tools/registry.js'
import { toolsToSpecs } from '../tools/providerSchema.js'

test('converts built-in tools to provider specs', () => {
  const specs = toolsToSpecs(BUILTIN_TOOLS)
  assert.equal(specs.length, BUILTIN_TOOLS.length)
  for (const spec of specs) {
    assert.ok(spec.name)
    assert.ok(spec.description)
    assert.equal(typeof spec.inputSchema, 'object')
  }
})
