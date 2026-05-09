import test from 'node:test'
import assert from 'node:assert/strict'
import { redact, redactObject } from '../security/redact.js'

test('redacts common API keys', () => {
  assert.equal(redact('key sk-abcdefghijklmnopqrstuvwxyz123456'), 'key [REDACTED]')
  assert.equal(redact('api_key=sk-abcdefghijklmnopqrstuvwxyz123456'), '[REDACTED]')
})

test('redacts object secret fields', () => {
  assert.deepEqual(redactObject({ apiKey: 'secret-value', nested: { token: 'abc123456789' } }), { apiKey: '[REDACTED]', nested: { token: '[REDACTED]' } })
})
