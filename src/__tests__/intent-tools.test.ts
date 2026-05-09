import test from 'node:test'
import assert from 'node:assert/strict'
import { toolsForAgent } from '../chat/agentLoop.js'

test('plan agent stays read-only without write intent', () => {
  const ids = toolsForAgent('plan', [{ role: 'user', content: 'liste os arquivos' }]).map((tool) => tool.id)
  assert.equal(ids.includes('write'), false)
  assert.equal(ids.includes('mkdir'), false)
})

test('write intent enables build tools even for plan agent', () => {
  const ids = toolsForAgent('plan', [{ role: 'user', content: 'crie um site simples com index.html style.css script.js' }]).map((tool) => tool.id)
  assert.equal(ids.includes('write'), true)
  assert.equal(ids.includes('mkdir'), true)
})
