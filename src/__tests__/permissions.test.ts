import test from 'node:test'
import assert from 'node:assert/strict'
import { PermissionManager } from '../permissions/permissions.js'
import { DEFAULT_CONFIG } from '../config/config.js'

test('detects dangerous shell commands', () => {
  const permissions = new PermissionManager(DEFAULT_CONFIG)
  assert.equal(permissions.isDangerousShell('git reset --hard HEAD'), true)
  assert.equal(permissions.isDangerousShell('git push --force-with-lease origin main'), true)
  assert.equal(permissions.isDangerousShell('rm -rf /'), true)
  assert.equal(permissions.isDangerousShell('rm -fr /'), true)
  assert.equal(permissions.isDangerousShell('rm -rfv /'), true)
  assert.equal(permissions.isDangerousShell('echo hello'), false)
})

test('autoAllow eligibility excludes dangerous shell commands', () => {
  const permissions = new PermissionManager({ ...DEFAULT_CONFIG, permissions: { ...DEFAULT_CONFIG.permissions, autoAllow: true } }, 'test-auto-allow')
  assert.equal(permissions.canAutoAllow('shell', 'echo hello', { command: 'echo hello' }), true)
  assert.equal(permissions.canAutoAllow('shell', 'rm -rf /', { command: 'rm -rf /' }), false)
  assert.equal(permissions.canAutoAllow('shell', 'rm -fr /', { command: 'rm -fr /' }), false)
})

test('allowAll still hard-blocks destructive shell commands while allowing normal autonomous tools', async () => {
  const permissions = new PermissionManager({
    ...DEFAULT_CONFIG,
    permissions: { ...DEFAULT_CONFIG.permissions, allowAll: true },
  }, 'test-allow-all')

  assert.equal(permissions.canAutoAllow('shell', 'rm -rf /', { command: 'rm -rf /' }), false)
  assert.equal(await permissions.require('shell', 'rm -rf /', { command: 'rm -rf /' }), false)
  assert.equal(await permissions.require('shell', 'echo ok', { command: 'echo ok' }), true)
  assert.equal(await permissions.require('write', 'write package.json'), true)
  assert.equal(await permissions.require('network', 'https://example.com'), true)
})
