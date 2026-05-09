import { spawnSync } from 'node:child_process'
import { OpenDeepConfig } from './types.js'
import { getConfigDirs } from './config/paths.js'
import { getProviderConfigs } from './providers/registry.js'

function check(command: string, args: string[]) {
  const result = spawnSync(command, args, { encoding: 'utf8' })
  return result.status === 0 ? 'ok' : 'missing'
}

export async function doctor(config: OpenDeepConfig) {
  const dirs = getConfigDirs()
  const providers = getProviderConfigs(config)
  const active = providers.find((provider) => provider.id === config.defaultProvider)
  const rows: Array<[string, string]> = [
    ['node', process.version],
    ['platform', `${process.platform}/${process.arch}`],
    ['config', dirs.config],
    ['git', check('git', ['--version'])],
    ['rg', check('rg', ['--version'])],
    ['defaultProvider', config.defaultProvider],
    ['defaultModel', config.defaultModel],
    ['providerImplemented', active?.kind === 'placeholder' ? 'planned' : active ? 'yes' : 'no'],
    ['autoAllow', String(config.permissions.autoAllow)],
  ]
  for (const [key, value] of rows) console.log(`${key.padEnd(20)} ${value}`)
}
