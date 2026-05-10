import { Command } from 'commander'
import { readFile } from 'node:fs/promises'
import { loadConfig, updateConfig, configPath } from './config/config.js'
import { runChat, runPrompt } from './chat/chat.js'
import { getProviderConfigs } from './providers/registry.js'
import { redactObject, safeError } from './security/redact.js'
import { doctor } from './doctor.js'
import { previewImports } from './importers/importers.js'
import { formatModelCatalog, parseProviderModel } from './providers/modelCatalog.js'
import { listSessions, loadSession, formatSessionList } from './sessions/sessionStore.js'
import { formatProjectList, listProjects, upsertProject } from './projects/projectStore.js'
import { getSecret } from './security/secrets.js'
import { configureApiKey } from './auth/auth.js'
import { formatToolList } from './tools/registry.js'
import { addPermissionRule, formatPermissionRules, loadPermissionRules, PermissionCategory } from './permissions/rules.js'

export async function runCli(argv: string[]) {
  if (argv[1]?.toLowerCase().endsWith('opendeep')) {
    console.warn('Aviso: opendeep foi renomeado para deepcode. O alias legado continuará funcionando temporariamente.')
  }
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
  const program = new Command()

  program
    .name('deepcode')
    .description('DeepCode terminal AI CLI')
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

  const configuredProviderConfigs = async () => {
    const providers = getProviderConfigs(await loadConfig())
    const configured = []
    for (const provider of providers) {
      if (!provider.apiKeyEnv || await getSecret(provider.apiKeyEnv)) configured.push(provider)
    }
    return configured.length ? configured : providers
  }

  program.command('models')
    .description('List recommended models; defaults to providers already configured with API keys')
    .argument('[provider]')
    .option('--all', 'Show all providers')
    .action(async (provider?: string, options?: { all?: boolean }) => {
      const providers = options?.all ? getProviderConfigs(await loadConfig()) : await configuredProviderConfigs()
      console.log(formatModelCatalog(providers, provider))
    })

  program.command('use')
    .description('Set default provider/model in one step')
    .argument('<provider-or-provider/model>')
    .action(async (target: string) => {
      const next = await updateConfig((config) => {
        const providers = getProviderConfigs(config)
        const directProvider = target.includes('/') ? undefined : providers.find((item) => item.id === target)
        const parsed = directProvider ? { providerId: directProvider.id, model: directProvider.defaultModel } : parseProviderModel(target, config.defaultProvider)
        const found = parsed ? providers.find((item) => item.id === parsed.providerId) : undefined
        if (!parsed || !found) throw new Error(`Unknown provider/model: ${target}`)
        config.defaultProvider = found.id
        config.defaultModel = parsed.model || found.defaultModel
      })
      console.log(`Default: ${next.defaultProvider}/${next.defaultModel}`)
    })

  const configureProvider = async (providerId: string) => {
    const provider = getProviderConfigs(await loadConfig()).find((item) => item.id === providerId)
    if (!provider) throw new Error(`Unknown provider: ${providerId}`)
    console.log(await configureApiKey(provider))
  }

  program.command('codex')
    .description('Run official OpenAI/Codex OAuth login and set Codex as default provider')
    .action(async () => {
      await configureProvider('codex-oauth')
      const next = await updateConfig((config) => {
        config.defaultProvider = 'codex-oauth'
        config.defaultModel = process.env.CODEX_MODEL ?? 'gpt-5.5'
      })
      console.log(`Default: ${next.defaultProvider}/${next.defaultModel}`)
    })

  program.command('auth')
    .alias('login')
    .description('Configure provider API key securely')
    .argument('<provider>')
    .action(configureProvider)

  program.command('setup')
    .description('Alias for auth: configure provider API key securely')
    .argument('<provider>')
    .action(configureProvider)

  program.command('sessions')
    .description('List recent sessions')
    .action(async () => console.log(formatSessionList(await listSessions())))

  program.command('session')
    .description('Show a session by id')
    .argument('<id>')
    .action(async (id: string) => {
      const session = await loadSession(id)
      if (!session) throw new Error(`Session not found: ${id}`)
      console.log(JSON.stringify(session, null, 2))
    })

  program.command('projects')
    .description('List recent projects')
    .action(async () => console.log(formatProjectList(await listProjects())))

  program.command('project')
    .description('Register current or provided project path')
    .argument('[path]')
    .action(async (path?: string) => console.log(JSON.stringify(await upsertProject(path ?? process.cwd()), null, 2)))

  program.command('tools')
    .description('List local tools available to agents')
    .action(() => console.log(formatToolList()))

  program.command('permissions')
    .description('List permission rules for current project')
    .action(async () => {
      const project = await upsertProject(process.cwd())
      console.log(formatPermissionRules(await loadPermissionRules(project.id)))
    })

  program.command('allow')
    .description('Allow a permission pattern for current project')
    .argument('<permission>')
    .argument('<pattern...>')
    .action(async (permission: string, pattern: string[]) => {
      const project = await upsertProject(process.cwd())
      await addPermissionRule(project.id, { permission: permission as PermissionCategory, pattern: pattern.join(' '), action: 'allow' })
      console.log(`allow ${permission} ${pattern.join(' ')}`)
    })

  program.command('allowall')
    .alias('unsafe')
    .description('Toggle full no-prompt permission mode for AI tools, including dangerous shell commands')
    .argument('[value]', 'on/off/status', 'status')
    .action(async (value: string) => {
      const raw = value.toLowerCase()
      if (raw === 'status') {
        const config = await loadConfig()
        console.log(config.permissions.allowAll ? 'allowAll=on' : 'allowAll=off')
        return
      }
      if (!['on', 'off', 'true', 'false', '1', '0', 'yes', 'no'].includes(raw)) throw new Error('Usage: deepcode allowall [on|off|status]')
      const enabled = ['on', 'true', '1', 'yes'].includes(raw)
      const next = await updateConfig((config) => {
        config.permissions.allowAll = enabled
        if (enabled) {
          config.permissions.autoAllow = true
          config.permissions.allowShell = true
          config.permissions.allowWrite = true
          config.permissions.allowNetwork = true
        }
      })
      console.log(`allowAll=${next.permissions.allowAll ? 'on' : 'off'}`)
      if (next.permissions.allowAll) console.warn('WARNING: DeepCode will not ask before executing any AI tool/command, including destructive shell commands.')
    })

  program.command('deny')
    .description('Deny a permission pattern for current project')
    .argument('<permission>')
    .argument('<pattern...>')
    .action(async (permission: string, pattern: string[]) => {
      const project = await upsertProject(process.cwd())
      await addPermissionRule(project.id, { permission: permission as PermissionCategory, pattern: pattern.join(' '), action: 'deny' })
      console.log(`deny ${permission} ${pattern.join(' ')}`)
    })

  program.command('config')
    .description('Show safe config')
    .option('--path', 'Print config path')
    .option('--allow-all <value>', 'Set permissions.allowAll true/false (no prompts, unsafe)')
    .option('--auto-allow <value>', 'Set permissions.autoAllow true/false')
    .action(async (options: { path?: boolean; allowAll?: string; autoAllow?: string }) => {
      if (options.path) {
        console.log(await configPath())
        return
      }
      if (options.allowAll !== undefined) {
        const value = options.allowAll === 'true'
        await updateConfig((config) => {
          config.permissions.allowAll = value
          if (value) {
            config.permissions.autoAllow = true
            config.permissions.allowShell = true
            config.permissions.allowWrite = true
            config.permissions.allowNetwork = true
          }
        })
        console.log(`permissions.allowAll=${value}`)
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
