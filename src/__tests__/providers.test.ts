import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_CONFIG } from '../config/config.js'
import { getProviderConfigs, resolveModel } from '../providers/registry.js'

test('registers required providers', () => {
  const ids = getProviderConfigs(DEFAULT_CONFIG).map((provider) => provider.id)
  for (const id of ['openai', 'anthropic', 'gemini', 'openrouter', 'nvidia', 'deepseek', 'groq', 'mistral', 'xai', 'perplexity', 'together', 'fireworks', 'ollama', 'lmstudio', 'github-models', 'bedrock', 'vertex', 'foundry', 'codex']) {
    assert.ok(ids.includes(id), `missing ${id}`)
  }
})

test('resolves model from provider default when env is absent', () => {
  const previous = process.env.OPENAI_MODEL
  delete process.env.OPENAI_MODEL
  try {
    const provider = getProviderConfigs(DEFAULT_CONFIG).find((item) => item.id === 'openai')!
    assert.equal(resolveModel(provider), 'gpt-4o-mini')
  } finally {
    if (previous !== undefined) process.env.OPENAI_MODEL = previous
  }
})
