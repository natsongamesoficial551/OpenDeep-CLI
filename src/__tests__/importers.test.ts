import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { previewImports, importCodexLocalAuth } from '../importers/importers.js'

async function withTempDir(fn: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'opendeep-importers-'))
  try {
    await fn(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

test('preview imports returns warnings without config', async () => {
  const result = await previewImports(process.cwd())
  assert.ok(Array.isArray(result.sources))
  assert.ok(Array.isArray(result.warnings))
})

test('codex auth imports token from tokens.access_token', async () => {
  await withTempDir(async (dir) => {
    const authFile = join(dir, 'config.json')
    await writeFile(authFile, JSON.stringify({ auth_mode: 'chatgpt', OPENAI_API_KEY: null, tokens: { access_token: 'oauth_access_token_123' } }), 'utf8')

    const originalCodePath = process.env.CODEX_AUTH_JSON_PATH
    const originalOpenAi = process.env.OPENAI_API_KEY
    const originalCodex = process.env.CODEX_API_KEY
    try {
      process.env.CODEX_AUTH_JSON_PATH = authFile
      delete process.env.OPENAI_API_KEY
      delete process.env.CODEX_API_KEY

      const result = await importCodexLocalAuth()
      assert.equal(result.imported, true)
      assert.match(result.message, /Credencial Codex importada do login local/i)
    } finally {
      if (originalCodePath === undefined) delete process.env.CODEX_AUTH_JSON_PATH
      else process.env.CODEX_AUTH_JSON_PATH = originalCodePath
      if (originalOpenAi === undefined) delete process.env.OPENAI_API_KEY
      else process.env.OPENAI_API_KEY = originalOpenAi
      if (originalCodex === undefined) delete process.env.CODEX_API_KEY
      else process.env.CODEX_API_KEY = originalCodex
    }
  })
})

test('codex auth message explains ChatGPT subscription is not API access', async () => {
  const userHome = process.env.USERPROFILE
  if (!userHome) return

  const originalCodePath = process.env.CODEX_AUTH_JSON_PATH
  const originalOpenAi = process.env.OPENAI_API_KEY
  const originalCodex = process.env.CODEX_API_KEY
  try {
    process.env.CODEX_AUTH_JSON_PATH = `${userHome}\\.codex\\config.json`
    delete process.env.OPENAI_API_KEY
    delete process.env.CODEX_API_KEY

    const result = await importCodexLocalAuth()
    if (!result.imported) {
      assert.match(result.message, /assinatura do ChatGPT não libera API automaticamente/i)
      assert.match(result.message, /OPENAI_API_KEY|CODEX_API_KEY/i)
    }
  } finally {
    if (originalCodePath === undefined) delete process.env.CODEX_AUTH_JSON_PATH
    else process.env.CODEX_AUTH_JSON_PATH = originalCodePath
    if (originalOpenAi === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = originalOpenAi
    if (originalCodex === undefined) delete process.env.CODEX_API_KEY
    else process.env.CODEX_API_KEY = originalCodex
  }
})
