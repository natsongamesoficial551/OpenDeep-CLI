import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyError } from '../core/errors.js'

test('classifies common runtime errors with suggested actions', () => {
  assert.equal(classifyError(new Error('429 rate limit exceeded')).category, 'rate-limit')
  assert.equal(classifyError(new Error('401 invalid api key')).category, 'auth')
  assert.equal(classifyError(new Error('ECONNREFUSED')).retryable, true)
  assert.equal(classifyError(new Error('maximum context length exceeded')).category, 'model')
  assert.equal(classifyError(new DOMException('Aborted', 'AbortError')).category, 'cancelled')
})
