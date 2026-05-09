import test from 'node:test'
import assert from 'node:assert/strict'
import { truncateOutput } from '../core/truncation.js'

test('truncates output by utf8 byte length', async () => {
  const input = 'á'.repeat(30_000)
  const result = await truncateOutput(input, { maxBytes: 48_000, prefix: 'test' })
  assert.equal(result.truncated, true)
  assert.ok(Buffer.byteLength(result.content, 'utf8') <= 48_000)
  assert.ok(result.outputPath)
})
