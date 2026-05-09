import test from 'node:test'
import assert from 'node:assert/strict'
import { PermissionManager } from '../permissions/permissions.js'
import { DEFAULT_CONFIG } from '../config/config.js'

test('detects dangerous shell commands', () => {
  const permissions = new PermissionManager(DEFAULT_CONFIG)
  assert.equal(permissions.isDangerousShell('git reset --hard HEAD'), true)
  assert.equal(permissions.isDangerousShell('echo hello'), false)
})
