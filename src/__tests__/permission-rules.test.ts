import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluatePermission, matchesPermissionRule } from '../permissions/rules.js'

test('permission rules match wildcards', () => {
  assert.equal(matchesPermissionRule({ permission: 'edit', pattern: 'src/**/*.ts', action: 'allow' }, 'edit', 'src/tools/edit.ts'), true)
  assert.equal(matchesPermissionRule({ permission: 'edit', pattern: 'src/**/*.ts', action: 'allow' }, 'write', 'src/tools/edit.ts'), false)
})

test('permission evaluation defaults to ask', () => {
  assert.equal(evaluatePermission([], 'shell', 'npm test').action, 'ask')
  assert.equal(evaluatePermission([{ permission: 'shell', pattern: 'npm *', action: 'allow' }], 'shell', 'npm test').action, 'allow')
})
