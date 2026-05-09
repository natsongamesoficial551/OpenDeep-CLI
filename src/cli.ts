import { Command } from 'commander'
import { readFile } from 'node:fs/promises'
import { loadConfig, saveConfig, updateConfig, configPath } from './config/config.js'
import { runChat, runPrompt } from './chat/chat.js'
import { getProviderConfigs } from './providers/registry.js'
import { redactObject, safeError } from './security/redact.js'
import { doctor } from './doctor.js'
import { previewImports } from './importers/importers.js'

export async function runCli(argv: string[]) {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
  const program = new Command()

  program
    .name('opendeep')
    .description('OpenDeep terminal AI CLI')
    .version(pkg.version)
    .argument('[prompt...]', 'Prompt to run once')
    .action(async (prompt: string[]) => {
      const config = await loadConfig()
      if (prompt.length > 0) await runPrompt(prompt.join(' '), config)
      else await runChat(config)
    })

  program.command('providers')
    .description('List supported providers')
    .action(async () => {
      const config = await loadConfig()
      for (const provider of getProviderConfigs(config)) {
        console.log(`${provider.id}\t${provider.name}\t${provider.kind}\t${provider.defaultModel}`)
      }
    })

  program.command('provider')
    .description('Set default provider and model')
    .argument('<provider>')
    .argument('[model]')
    .action(async (provider: string, model?: string) => {
      const next = await updateConfig((config) => {
        const found = getProviderConfigs(config).find((item) => item.id === provider)
        if (!found) throw new Error(`Unknown provider: ${provider}`)
        config.defaultProvider = provider
        config.defaultModel = model ?? found.defaultModel
      })
      console.log(`Default: ${next.defaultProvider}/${next.defaultModel}`)
    })

  program.command('config')
    .description('Show safe config')
    .option('--path', 'Print config path')
    .option('--auto-allow <value>', 'Set permissions.autoAllow true/false')
    .action(async (options: { path?: boolean; autoAllow?: string }) => {
      if (options.path) {
        console.log(await configPath())
        return
      }
      if (options.autoAllow !== undefined) {
        const value = options.autoAllow === 'true'
        await updateConfig((config) => { config.permissions.autoAllow = value })
        console.log(`permissions.autoAllow=${value}`)
        return
      }
      console.log(JSON.stringify(redactObject(await loadConfig()), null, 2))
    })

  program.command('doctor')
    .description('Check runtime and configuration')
    .action(async () => doctor(await loadConfig()))

  program.command('import')
    .description('Preview imports from OpenClaude/OpenCode/OpenClaw style configs')
    .option('--apply', 'Apply safe non-secret imports')
    .action(async (options: { apply?: boolean }) => {
      const result = await previewImports(process.cwd())
      console.log(JSON.stringify(redactObject(result), null, 2))
      if (options.apply && result.profile) {
        await updateConfig((config) => {
          config.defaultProvider = result.profile!.provider
          config.defaultModel = result.profile!.model
          if (result.profile!.baseUrl) config.providers[result.profile!.provider] = { ...config.providers[result.profile!.provider], baseUrl: result.profile!.baseUrl }
        })
        console.log('Imported safe provider/model settings. Secrets were not copied into plain text config.')
      }
    })

  try {
    await program.parseAsync(argv)
  } catch (error) {
    console.error(`Error: ${safeError(error)}`)
    process.exitCode = 1
  }
}
