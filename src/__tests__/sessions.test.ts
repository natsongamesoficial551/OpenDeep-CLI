import test from 'node:test'
import assert from 'node:assert/strict'
import { sessionTitleFromPrompt } from '../sessions/sessionStore.js'

test('creates a session title from first prompt', () => {
  assert.equal(sessionTitleFromPrompt('  hello   world  '), 'hello world')
  assert.equal(sessionTitleFromPrompt(''), 'Nova sessão')
})
