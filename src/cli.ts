import { Command } from 'commander'
import { readFile } from 'node:fs/promises'
import { loadConfig, updateConfig, configPath } from './config/config.js'
import { runChat, runPrompt } from './chat/chat.js'
import { getProviderConfigs } from './providers/registry.js'
import { redactObject, safeError } from './security/redact.js'
import { doctor } from './doctor.js'
import { previewImports } from './importers/importers.js'
import { formatModelCatalog } from './providers/modelCatalog.js'
import { listSessions, loadSession, formatSessionList } from './sessions/sessionStore.js'
import { formatProjectList, listProjects, upsertProject } from './projects/projectStore.js'
import { configureApiKey } from './auth/auth.js'
import { formatToolList } from './tools/registry.js'
import { addPermissionRule, formatPermissionRules, loadPermissionRules, PermissionCategory } from './permissions/rules.js'

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

  program.command('models')
    .description('List recommended models')
    .argument('[provider]')
    .action(async (provider?: string) => console.log(formatModelCatalog(getProviderConfigs(await loadConfig()), provider)))

  const configureProvider = async (providerId: string) => {
    const provider = getProviderConfigs(await loadConfig()).find((item) => item.id === providerId)
    if (!provider) throw new Error(`Unknown provider: ${providerId}`)
    console.log(await configureApiKey(provider))
  }

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
