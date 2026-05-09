import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_CONFIG } from '../config/config.js'
import { PermissionManager } from '../permissions/permissions.js'
import { runTool } from '../tools/registry.js'
import { clearJobsForTests } from '../tools/localRunner.js'

function ctx(cwd: string, permissions = new PermissionManager({ ...DEFAULT_CONFIG, permissions: { ...DEFAULT_CONFIG.permissions, autoAllow: true } }, `tool-runner-${Date.now()}`)) {
  return { cwd, sessionId: 'test', agent: 'test', permissions, metadata: async () => {} }
}

async function withTempProject(run: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'opendeep-tool-runner-'))
  try {
    await run(dir)
  } finally {
    clearJobsForTests()
    await new Promise((resolve) => setTimeout(resolve, 100))
    await rm(dir, { recursive: true, force: true })
  }
}

test('runTool read blocks paths outside root', async () => {
  await withTempProject(async (dir) => {
    await writeFile(join(dir, 'inside.txt'), 'hello')
    const result = await runTool('read', { filePath: 'inside.txt' }, ctx(dir))
    assert.equal(result.output, 'hello')
    await assert.rejects(runTool('read', { filePath: '../outside.txt' }, ctx(dir)), /outside project root/)
  })
})

test('runTool grep returns relative paths', async () => {
  await withTempProject(async (dir) => {
    await writeFile(join(dir, 'inside.ts'), 'export const value = 1')
    const result = await runTool('grep', { pattern: 'value', glob: '**/*.ts' }, ctx(dir))
    assert.match(result.output, /^inside\.ts:1:/)
    assert.equal(result.output.includes(dir), false)
  })
})

test('runTool bash respects dangerous command autoAllow guard', async () => {
  await withTempProject(async (dir) => {
    const permissions = new PermissionManager({ ...DEFAULT_CONFIG, permissions: { ...DEFAULT_CONFIG.permissions, autoAllow: true } }, `danger-${Date.now()}`)
    assert.equal(permissions.canAutoAllow('shell', 'rm -rf /', { command: 'rm -rf /' }), false)
    assert.equal(await runTool('bash', { command: 'node --version', timeoutMs: 30_000 }, ctx(dir, permissions)).then(() => true), true)
  })
})

test('background runner starts, reports, and stops jobs', async () => {
  await withTempProject(async (dir) => {
    const start = await runTool('run_background', { command: 'node -e "console.log(\'ready\'); setInterval(() => {}, 1000)"', label: 'test server' }, ctx(dir))
    assert.match(start.output, /jobId: job-1/)
    const status = await runTool('job_status', { jobId: 'job-1' }, ctx(dir))
    assert.match(status.output, /status: running/)
    assert.match(status.output, /ready|no logs yet/)
    const stop = await runTool('job_stop', { jobId: 'job-1' }, ctx(dir))
    assert.match(stop.output, /Stop signal sent/)
  })
})
