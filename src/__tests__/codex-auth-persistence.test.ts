import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { importCodexLocalAuth } from '../importers/importers.js'
import { getSecret, deleteSecret } from '../security/secrets.js'

async function withTempDir(fn: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'deepcode-codex-auth-'))
  try { await fn(dir) } finally { await rm(dir, { recursive: true, force: true }) }
}

test('codex auth import persists full local OAuth token bundle', async () => {
  await withTempDir(async (dir) => {
    const authFile = join(dir, 'auth.json')
    await writeFile(authFile, JSON.stringify({
      tokens: {
        access_token: 'access_123',
        refresh_token: 'refresh_123',
        id_token: 'id_123',
        expires_in: 3600,
      },
      chatgpt_account_id: 'account_123',
    }), 'utf8')

    const originalCodePath = process.env.CODEX_AUTH_JSON_PATH
    const originalSecretsPath = process.env.DEEPCODE_SECRETS_PATH
    const originalDisableKeytar = process.env.DEEPCODE_DISABLE_KEYTAR
    try {
      process.env.CODEX_AUTH_JSON_PATH = authFile
      process.env.DEEPCODE_SECRETS_PATH = join(dir, 'secrets.enc.json')
      process.env.DEEPCODE_DISABLE_KEYTAR = '1'
      await Promise.all([
        deleteSecret('CODEX_OAUTH_TOKEN'),
        deleteSecret('CODEX_OAUTH_REFRESH_TOKEN'),
        deleteSecret('CODEX_OAUTH_ID_TOKEN'),
        deleteSecret('CODEX_ACCOUNT_ID'),
        deleteSecret('CODEX_OAUTH_EXPIRES_AT'),
      ])

      const result = await importCodexLocalAuth()
      assert.equal(result.imported, true)
      assert.equal(await getSecret('CODEX_OAUTH_TOKEN'), 'access_123')
      assert.equal(await getSecret('CODEX_OAUTH_REFRESH_TOKEN'), 'refresh_123')
      assert.equal(await getSecret('CODEX_OAUTH_ID_TOKEN'), 'id_123')
      assert.equal(await getSecret('CODEX_ACCOUNT_ID'), 'account_123')
      assert.ok(Number(await getSecret('CODEX_OAUTH_EXPIRES_AT')) > Date.now())
    } finally {
      if (originalCodePath === undefined) delete process.env.CODEX_AUTH_JSON_PATH
      else process.env.CODEX_AUTH_JSON_PATH = originalCodePath
      if (originalSecretsPath === undefined) delete process.env.DEEPCODE_SECRETS_PATH
      else process.env.DEEPCODE_SECRETS_PATH = originalSecretsPath
      if (originalDisableKeytar === undefined) delete process.env.DEEPCODE_DISABLE_KEYTAR
      else process.env.DEEPCODE_DISABLE_KEYTAR = originalDisableKeytar
    }
  })
})
