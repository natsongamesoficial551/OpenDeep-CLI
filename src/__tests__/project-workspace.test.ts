import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createWorkspaceProject, defaultProjectsRoot, projectCreationTargetFromPrompt } from '../projects/projectStore.js'
import { DEFAULT_CONFIG } from '../config/config.js'

async function withTempDir(fn: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'deepcode-projects-'))
  try { await fn(dir) } finally { await rm(dir, { recursive: true, force: true }) }
}

test('default projects root uses configured workspace directory when set', () => {
  const root = defaultProjectsRoot({ ...DEFAULT_CONFIG, workspace: { projectsDir: '/tmp/deep-projects' } })
  assert.match(root.replaceAll('\\', '/'), /tmp\/deep-projects$/)
})

test('createWorkspaceProject creates an organized slug folder under projects root', async () => {
  await withTempDir(async (dir) => {
    const config = { ...DEFAULT_CONFIG, workspace: { projectsDir: dir } }
    const project = await createWorkspaceProject('Criar um SaaS financeiro completo', config)
    assert.equal(project.name, 'um-saas-financeiro-completo')
    assert.equal(project.path, join(dir, 'um-saas-financeiro-completo'))
    assert.ok(existsSync(project.path))
  })
})

test('project prompt target detects one-shot explicit folder override', () => {
  const target = projectCreationTargetFromPrompt('crie um app de tarefas em C:/tmp/minha-app')
  assert.equal(target?.explicitPath?.replaceAll('\\\\', '/'), 'C:/tmp/minha-app')
})
