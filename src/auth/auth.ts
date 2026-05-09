import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { ProviderConfig } from '../types.js'
import { importCodexLocalAuth } from '../importers/importers.js'
import { setSecret } from '../security/secrets.js'

async function askHidden(question: string) {
  if (!process.stdin.isTTY) {
    const rl = readline.createInterface({ input, output })
    try {
      return await rl.question(question)
    } finally {
      rl.close()
    }
  }

  return new Promise<string>((resolve) => {
    const stdin = process.stdin
    const stdout = process.stdout
    let value = ''

    stdout.write(question)
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')

    const onData = (char: string) => {
      if (char === '\u0003') {
        stdout.write('\n')
        stdin.setRawMode(false)
        stdin.off('data', onData)
        resolve('')
        return
      }
      if (char === '\r' || char === '\n') {
        stdout.write('\n')
        stdin.setRawMode(false)
        stdin.off('data', onData)
        resolve(value)
        return
      }
      if (char === '\u007f' || char === '\b') {
        value = value.slice(0, -1)
        return
      }
      value += char
    }

    stdin.on('data', onData)
  })
}

export async function configureApiKey(provider: ProviderConfig) {
  if (provider.id === 'codex-oauth') {
    const result = await importCodexLocalAuth()
    return result.message
  }
  if (!provider.apiKeyEnv) return `${provider.name} não usa API key configurável neste adapter.`
  const key = await askHidden(`Cole a API key para ${provider.name} (${provider.apiKeyEnv}): `)
  if (!key.trim()) return 'Configuração cancelada.'
  const backend = await setSecret(provider.apiKeyEnv, key.trim())
  return `API key salva com segurança em ${backend} para ${provider.apiKeyEnv}.`
}
