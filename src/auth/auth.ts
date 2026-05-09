import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { ProviderConfig } from '../types.js'
import { setSecret } from '../security/secrets.js'

export async function configureApiKey(provider: ProviderConfig) {
  if (!provider.apiKeyEnv) return `${provider.name} não usa API key configurável neste adapter.`
  const rl = readline.createInterface({ input, output })
  try {
    const key = await rl.question(`Cole a API key para ${provider.name} (${provider.apiKeyEnv}): `)
    if (!key.trim()) return 'Configuração cancelada.'
    const backend = await setSecret(provider.apiKeyEnv, key.trim())
    return `API key salva com segurança em ${backend} para ${provider.apiKeyEnv}.`
  } finally {
    rl.close()
  }
}
