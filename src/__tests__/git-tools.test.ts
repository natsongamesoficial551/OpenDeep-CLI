import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_CONFIG } from '../config/config.js'
import { PermissionManager } from '../permissions/permissions.js'
import { runTool } from '../tools/registry.js'

function ctx(cwd: string) {
  return { cwd, sessionId: 'test', agent: 'test', permissions: new PermissionManager({ ...DEFAULT_CONFIG, permissions: { ...DEFAULT_CONFIG.permissions, autoAllow: true } }, `git-${Date.now()}`), metadata: async () => {} }
}

test('git tools return controlled errors outside git repos', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'opendeep-git-'))
  try {
    await assert.rejects(runTool('git_status', {}, ctx(dir)), /not a git repository|git exited/i)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
