import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import chalk from 'chalk'
import { ChatMessage, OpenDeepConfig } from '../types.js'
import { createProvider, getProviderConfigs, resolveModel } from '../providers/registry.js'
import { safeError } from '../security/redact.js'

export async function runPrompt(prompt: string, config: OpenDeepConfig) {
  const providerConfig = getProviderConfigs(config).find((provider) => provider.id === config.defaultProvider)
  if (!providerConfig) throw new Error(`Default provider not found: ${config.defaultProvider}`)
  const provider = createProvider(providerConfig.id, config)
  const model = config.defaultModel || resolveModel(providerConfig) || providerConfig.defaultModel
  const messages: ChatMessage[] = [{ role: 'user', content: prompt }]

  if (!config.ui.stream) {
    console.log(await provider.complete({ messages, model }))
    return
  }

  for await (const chunk of provider.stream({ messages, model })) process.stdout.write(chunk)
  process.stdout.write('\n')
}

function help() {
  return [
    'Comandos:',
    '  /help              Mostra ajuda',
    '  /providers         Lista provedores',
    '  /model p/m         Troca provider/model nesta sessão',
    '  /clear             Limpa contexto',
    '  /exit              Sai',
  ].join('\n')
}

export async function runChat(config: OpenDeepConfig) {
  const rl = readline.createInterface({ input, output })
  const messages: ChatMessage[] = []
  let providerId = config.defaultProvider
  let providerConfig = getProviderConfigs(config).find((provider) => provider.id === providerId)
  let model = config.defaultModel || (providerConfig ? resolveModel(providerConfig) || providerConfig.defaultModel : '')

  console.log(chalk.cyan('OpenDeep'))
  console.log(`Provider: ${providerId} | Model: ${model}`)
  console.log('Digite /help para comandos. /exit para sair.\n')

  try {
    while (true) {
      const text = (await rl.question(chalk.green('you> '))).trim()
      if (!text) continue
      if (text === '/exit' || text === '/quit') break
      if (text === '/help') {
        console.log(help())
        continue
      }
      if (text === '/providers') {
        for (const provider of getProviderConfigs(config)) console.log(`${provider.id}\t${provider.name}\t${provider.defaultModel}${provider.kind === 'placeholder' ? '\t(planned)' : ''}`)
        continue
      }
      if (text === '/clear') {
        messages.length = 0
        console.log('Contexto limpo.')
        continue
      }
      if (text.startsWith('/model ')) {
        const selection = text.slice('/model '.length).trim()
        const parts = selection.includes('/') ? selection.split(/\/(.+)/).filter(Boolean) : [providerId, selection]
        const nextProvider = parts[0]
        const nextModel = parts[1]
        if (!nextProvider || !nextModel) {
          console.log('Uso: /model provider/model')
          continue
        }
        providerConfig = getProviderConfigs(config).find((provider) => provider.id === nextProvider)
        if (!providerConfig) {
          console.log('Uso: /model provider/model')
          continue
        }
        providerId = nextProvider
        model = nextModel
        console.log(`Modelo ativo: ${providerId}/${model}`)
        continue
      }

      messages.push({ role: 'user', content: text })
      try {
        const provider = createProvider(providerId, config)
        process.stdout.write(chalk.blue('ai> '))
        let answer = ''
        for await (const chunk of provider.stream({ messages, model })) {
          answer += chunk
          process.stdout.write(chunk)
        }
        process.stdout.write('\n')
        messages.push({ role: 'assistant', content: answer })
      } catch (error) {
        console.error(chalk.red(`Erro: ${safeError(error)}`))
      }
    }
  } finally {
    rl.close()
  }
}
