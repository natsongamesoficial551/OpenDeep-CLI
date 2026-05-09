import test from 'node:test'
import assert from 'node:assert/strict'
import { previewImports } from '../importers/importers.js'

test('preview imports returns warnings without config', async () => {
  const result = await previewImports(process.cwd())
  assert.ok(Array.isArray(result.sources))
  assert.ok(Array.isArray(result.warnings))
})
