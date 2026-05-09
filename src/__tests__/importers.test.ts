import test from 'node:test'
import assert from 'node:assert/strict'
import { previewImports, importCodexLocalAuth } from '../importers/importers.js'

test('preview imports returns warnings without config', async () => {
  const result = await previewImports(process.cwd())
  assert.ok(Array.isArray(result.sources))
  assert.ok(Array.isArray(result.warnings))
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
