import test from 'node:test'
import assert from 'node:assert/strict'
import { createInputDraft, inputDraftDisplay, applyInputData } from '../chat/chat.js'

test('large pasted prompt is masked in terminal display but preserved in buffer', () => {
  const draft = createInputDraft()
  const pasted = `Crie um SaaS completo\n${'feature detalhada\n'.repeat(200)}`

  const result = applyInputData(draft, pasted)

  assert.equal(result.submit, undefined)
  assert.equal(draft.buffer, pasted)
  assert.match(inputDraftDisplay(draft), /^\[Pasted [\d.]+[KMG]? chars\]$/)
  assert.equal(inputDraftDisplay(draft).includes('feature detalhada'), false)
})

test('bracketed paste is unwrapped, masked, and submitted complete on enter', () => {
  const draft = createInputDraft()
  const pasted = 'linha 1\nlinha 2\nlinha 3'

  applyInputData(draft, `\u001b[200~${pasted}\u001b[201~`)
  const result = applyInputData(draft, '\r')

  assert.equal(result.submit, pasted)
  assert.equal(inputDraftDisplay(draft).startsWith('[Pasted '), true)
})

test('typed text after a pasted prompt remains visible beside the pasted marker', () => {
  const draft = createInputDraft()
  const pasted = `Crie um SaaS completo\n${'feature detalhada\n'.repeat(80)}`

  applyInputData(draft, `\u001b[200~${pasted}\u001b[201~`)
  applyInputData(draft, ' com login e dashboard')

  assert.equal(draft.buffer, `${pasted} com login e dashboard`)
  assert.match(inputDraftDisplay(draft), /^\[Pasted [\d.]+[KMG]? chars\] com login e dashboard$/)
})
