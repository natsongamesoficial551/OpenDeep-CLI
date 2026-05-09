import test from 'node:test'
import assert from 'node:assert/strict'
import { isInsideRoot } from '../tools/pathGuard.js'

test('path guard blocks paths outside root', () => {
  assert.equal(isInsideRoot('/tmp/project', '/tmp/project/file.txt'), true)
  assert.equal(isInsideRoot('/tmp/project', '/tmp/other/file.txt'), false)
})
