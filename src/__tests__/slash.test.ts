import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveSlash, searchSlashCommands, SLASH_COMMANDS } from '../commands/slash.js'

test('resolves slash aliases and bare slash', () => {
  assert.deepEqual(resolveSlash('/'), { command: 'help', args: '' })
  assert.equal(resolveSlash('/?')?.command, 'help')
  assert.equal(resolveSlash('/setup openrouter')?.command, 'login')
  assert.equal(resolveSlash('/model openai/gpt-4o')?.command, 'model')
  assert.equal(resolveSlash('/use openai/gpt-4o')?.command, 'use')
  assert.equal(resolveSlash('/continue')?.command, 'continue')
  assert.equal(resolveSlash('/resume')?.command, 'continue')
  assert.equal(resolveSlash('/allowall')?.command, 'allowall')
  assert.equal(resolveSlash('/unsafe')?.command, 'allowall')
})

test('has rich command registry', () => {
  for (const name of ['provider', 'api', 'model', 'use', 'continue', 'agent', 'project', 'sessions', 'new', 'allowall']) {
    assert.ok(SLASH_COMMANDS.some((command) => command.name === name), `missing ${name}`)
  }
})

test('searches slash commands for palette', () => {
  const matches = searchSlashCommands('prov').map((command) => command.name)
  assert.ok(matches.includes('provider'))
  assert.ok(matches.includes('providers'))
})
