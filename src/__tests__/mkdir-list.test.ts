import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_CONFIG } from '../config/config.js'
import { PermissionManager } from '../permissions/permissions.js'
import { runTool } from '../tools/registry.js'

function ctx(cwd: string) {
  return { cwd, sessionId: 'test', agent: 'test', permissions: new PermissionManager({ ...DEFAULT_CONFIG, permissions: { ...DEFAULT_CONFIG.permissions, autoAllow: true } }, `mkdir-list-${Date.now()}`), metadata: async () => {} }
}

test('mkdir creates directories inside root and list shows relative names', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'opendeep-mkdir-'))
  try {
    await runTool('mkdir', { dirPath: 'Site Simples' }, ctx(dir))
    const result = await runTool('list', { dirPath: '.' }, ctx(dir))
    assert.match(result.output, /dir\s+Site Simples/)
    assert.equal(result.output.includes(dir), false)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('mkdir blocks paths outside root', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'opendeep-mkdir-'))
  try {
    await assert.rejects(runTool('mkdir', { dirPath: '../outside' }, ctx(dir)), /outside project root/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
