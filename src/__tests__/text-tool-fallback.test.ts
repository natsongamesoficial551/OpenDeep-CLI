import test from 'node:test'
import assert from 'node:assert/strict'
import { commandToolCallsFromText } from '../chat/agentLoop.js'

test('text fallback converts JSON write tool into a real write call', () => {
  const response = 'Vou criar agora. {"tool":"write","args":{"filePath":"index.html","content":"<h1>ok</h1>"}} Pronto.'
  const parsed = commandToolCallsFromText(response)

  assert.equal(parsed.calls.length, 1)
  assert.equal(parsed.calls[0]!.name, 'write')
  assert.deepEqual(parsed.calls[0]!.arguments, { filePath: 'index.html', content: '<h1>ok</h1>' })
  assert.equal(parsed.cleanedContent, 'Vou criar agora.  Pronto.')
})

test('text fallback accepts common aliases from model-emitted JSON', () => {
  const response = [
    '{"tool":"mkdir","arguments":{"path":"site"}}',
    '{"name":"write","arguments":{"path":"site/style.css","content":"body{}"}}',
  ].join('\n')
  const parsed = commandToolCallsFromText(response)

  assert.equal(parsed.calls.length, 2)
  assert.equal(parsed.calls[0]!.name, 'mkdir')
  assert.deepEqual(parsed.calls[0]!.arguments, { dirPath: 'site' })
  assert.equal(parsed.calls[1]!.name, 'write')
  assert.deepEqual(parsed.calls[1]!.arguments, { filePath: 'site/style.css', content: 'body{}' })
})

test('text fallback keeps shell JSON supported for providers without native tools', () => {
  const parsed = commandToolCallsFromText('{"cmd":"node --version"}')

  assert.equal(parsed.calls.length, 1)
  assert.equal(parsed.calls[0]!.name, 'bash')
  assert.deepEqual(parsed.calls[0]!.arguments, { command: 'node --version' })
})
