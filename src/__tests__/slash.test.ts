import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveSlash, SLASH_COMMANDS } from '../commands/slash.js'

test('resolves slash aliases and bare slash', () => {
  assert.deepEqual(resolveSlash('/'), { command: 'help', args: '' })
  assert.equal(resolveSlash('/?')?.command, 'help')
  assert.equal(resolveSlash('/model openai/gpt-4o')?.command, 'model')
})

test('has rich command registry', () => {
  for (const name of ['provider', 'api', 'model', 'agent', 'project', 'sessions', 'new']) {
    assert.ok(SLASH_COMMANDS.some((command) => command.name === name), `missing ${name}`)
  }
})
