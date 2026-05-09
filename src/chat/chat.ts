import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import chalk from 'chalk'
import { ChatRuntimeState, OpenDeepConfig, ProviderAdapter } from '../types.js'
import { createProvider, getProviderConfigs, resolveModel } from '../providers/registry.js'
import { safeError, redactObject } from '../security/redact.js'
import { renderCommandList, renderError, renderHeader, renderNotice, renderUserBubble } from '../ui/chatRenderer.js'
import { resolveSlash, SLASH_COMMANDS } from '../commands/slash.js'
import { formatModelCatalog, normalizeModel, parseProviderModel } from '../providers/modelCatalog.js'
import { configureApiKey } from '../auth/auth.js'
import { appendMessage, createSession, formatSessionList, listSessions, loadSession, saveSession } from '../sessions/sessionStore.js'
import { formatProjectList, listProjects, setProjectSession, upsertProject } from '../projects/projectStore.js'
import { BUILTIN_AGENTS } from '../agents/agents.js'
import { doctor } from '../doctor.js'
import { formatPermissionRules, addPermissionRule, loadPermissionRules, PermissionCategory } from '../permissions/rules.js'
import { runAgentTurn } from './agentLoop.js'

export async function runPromptWithProvider(prompt: string, config: OpenDeepConfig, provider: ProviderAdapter) {
  const providerConfig = getProviderConfigs(config).find((item) => item.id === provider.config.id) ?? provider.config
  const project = await upsertProject(process.cwd())
  const model = config.defaultModel ? normalizeModel(providerConfig.id, config.defaultModel) : normalizeModel(providerConfig.id, resolveModel(providerConfig) || providerConfig.defaultModel)
  const session = await createSession(project, providerConfig.id, model, 'general')
  const state: ChatRuntimeState = {
    providerId: providerConfig.id,
    model,
    agent: 'general',
    project: await setProjectSession(project, session.id),
    session,
  }

  renderUserBubble(prompt)
  appendMessage(state.session, { role: 'user', content: prompt })
  await runAgentTurn({ state, config, provider })
  state.session.provider = state.providerId
  state.session.model = state.model
  state.session.agent = state.agent
  await saveSession(state.session)
}

export async function runPrompt(prompt: string, config: OpenDeepConfig) {
  const providerConfig = getProviderConfigs(config).find((provider) => provider.id === config.defaultProvider)
  if (!providerConfig) throw new Error(`Default provider not found: ${config.defaultProvider}`)
  await runPromptWithProvider(prompt, config, createProvider(providerConfig.id, config))
}

function providerList(config: OpenDeepConfig) {
  return getProviderConfigs(config).map((provider) => {
    const status = provider.kind === 'placeholder' ? 'planejado' : 'pronto'
    return `${provider.id.padEnd(14)} ${provider.name.padEnd(22)} ${status.padEnd(9)} ${provider.defaultModel}`
  }).join('\n')
}

function agentList() {
  return BUILTIN_AGENTS.map((agent) => `${agent.name.padEnd(10)} ${agent.description}`).join('\n')
}

async function initialState(config: OpenDeepConfig): Promise<ChatRuntimeState> {
  const project = await upsertProject(process.cwd())
  const providerId = config.defaultProvider
  const providerConfig = getProviderConfigs(config).find((provider) => provider.id === providerId)
  const model = providerConfig
    ? (config.defaultModel ? normalizeModel(providerConfig.id, config.defaultModel) : normalizeModel(providerConfig.id, resolveModel(providerConfig) || providerConfig.defaultModel))
    : ''
  const existing = project.lastSessionId ? await loadSession(project.lastSessionId) : undefined
  const session = existing ?? await createSession(project, providerId, model)
  return {
    providerId: session.provider || providerId,
    model: session.model || model,
    agent: session.agent ?? 'general',
    project: await setProjectSession(project, session.id),
    session,
  }
}

async function handleSlash(text: string, state: ChatRuntimeState, config: OpenDeepConfig) {
  const parsed = resolveSlash(text)
  if (!parsed) return { handled: false, exit: false, state }
  if (parsed.unknown) {
    renderError(`Comando desconhecido: /${parsed.command}\nDigite / para ver comandos.`)
    return { handled: true, exit: false, state }
  }

  const providers = getProviderConfigs(config)
  switch (parsed.command) {
    case 'help':
      renderCommandList(SLASH_COMMANDS)
      return { handled: true, exit: false, state }
    case 'exit':
      return { handled: true, exit: true, state }
    case 'clear':
      state.session.messages = []
      await saveSession(state.session)
      renderNotice('Contexto', 'Contexto da sessão atual limpo.')
      return { handled: true, exit: false, state }
    case 'doctor':
      await doctor(config)
      return { handled: true, exit: false, state }
    case 'providers':
      renderNotice('Provedores', providerList(config))
      return { handled: true, exit: false, state }
    case 'provider': {
      const id = parsed.args.trim()
      if (!id) {
        renderNotice('Provider atual', `${state.providerId}/${state.model}\n\n${providerList(config)}`)
        return { handled: true, exit: false, state }
      }
      const provider = providers.find((item) => item.id === id)
      if (!provider) renderError(`Provider não encontrado: ${id}`)
      else {
        state.providerId = provider.id
        state.model = normalizeModel(provider.id, resolveModel(provider) || provider.defaultModel)
        state.session.provider = state.providerId
        state.session.model = state.model
        state.session.messages = []
        await saveSession(state.session)
        renderNotice('Provider alterado', `${state.providerId}/${state.model}\nContexto limpo para evitar misturar providers.`)
      }
      return { handled: true, exit: false, state }
    }
    case 'api':
    case 'login': {
      const id = parsed.args.trim() || state.providerId
      const provider = providers.find((item) => item.id === id)
      if (!provider) renderError(`Provider não encontrado: ${id}`)
      else renderNotice('API', await configureApiKey(provider))
      return { handled: true, exit: false, state }
    }
    case 'models': {
      const id = parsed.args.trim() || undefined
      renderNotice('Modelos', formatModelCatalog(providers, id))
      return { handled: true, exit: false, state }
    }
    case 'model': {
      const args = parsed.args.trim()
      if (!args) {
        renderNotice('Modelo atual', `${state.providerId}/${state.model}\n\n${formatModelCatalog(providers, state.providerId)}`)
        return { handled: true, exit: false, state }
      }
      const next = parseProviderModel(args, state.providerId)
      const provider = next ? providers.find((item) => item.id === next.providerId) : undefined
      if (!next || !provider) renderError('Uso: /model provider/model ou /model modelo')
      else {
        state.providerId = next.providerId
        state.model = next.model
        state.session.provider = state.providerId
        state.session.model = state.model
        state.session.messages = []
        await saveSession(state.session)
        renderNotice('Modelo alterado', `${state.providerId}/${state.model}\nContexto limpo para evitar misturar modelos.`)
      }
      return { handled: true, exit: false, state }
    }
    case 'agents':
      renderNotice('Agentes', agentList())
      return { handled: true, exit: false, state }
    case 'agent': {
      const name = parsed.args.trim()
      if (!name) renderNotice('Agente atual', `${state.agent}\n\n${agentList()}`)
      else if (!BUILTIN_AGENTS.some((agent) => agent.name === name)) renderError(`Agente não encontrado: ${name}`)
      else {
        state.agent = name
        state.session.agent = name
        await saveSession(state.session)
        renderNotice('Agente alterado', name)
      }
      return { handled: true, exit: false, state }
    }
    case 'projects':
      renderNotice('Projetos', formatProjectList(await listProjects()))
      return { handled: true, exit: false, state }
    case 'project': {
      const args = parsed.args.trim()
      if (args.startsWith('add ')) {
        const project = await upsertProject(args.slice(4).trim())
        renderNotice('Projeto registrado', `${project.name}\n${project.path}`)
      } else renderNotice('Projeto atual', `id     ${state.project.id}\nnome   ${state.project.name}\npath   ${state.project.path}`)
      return { handled: true, exit: false, state }
    }
    case 'new': {
      const session = await createSession(state.project, state.providerId, state.model, state.agent)
      state.session = session
      state.project = await setProjectSession(state.project, session.id)
      renderHeader(state)
      return { handled: true, exit: false, state }
    }
    case 'sessions':
      renderNotice('Sessões', formatSessionList(await listSessions(state.project.path)))
      return { handled: true, exit: false, state }
    case 'session': {
      const id = parsed.args.trim()
      const sessions = await listSessions(state.project.path)
      const session = sessions.find((item) => item.id === id || item.id.startsWith(id))
      if (!session) renderError(`Sessão não encontrada: ${id}`)
      else {
        state.session = session
        state.providerId = session.provider
        state.model = session.model
        state.agent = session.agent ?? 'general'
        state.project = await setProjectSession(state.project, session.id)
        renderHeader(state)
      }
      return { handled: true, exit: false, state }
    }
    case 'rename': {
      const title = parsed.args.trim()
      if (!title) renderError('Uso: /rename <titulo>')
      else {
        state.session.title = title
        await saveSession(state.session)
        renderNotice('Sessão renomeada', title)
      }
      return { handled: true, exit: false, state }
    }
    case 'config':
      renderNotice('Config', JSON.stringify(redactObject(config), null, 2))
      return { handled: true, exit: false, state }
    case 'tools':
      renderNotice('Tools', 'Tools are available to the active agent. Use natural language and the model will call tools when needed.')
      return { handled: true, exit: false, state }
    case 'permissions':
      renderNotice('Permissões', formatPermissionRules(await loadPermissionRules(state.project.id)))
      return { handled: true, exit: false, state }
    case 'allow':
    case 'deny': {
      const [permission, ...patternParts] = parsed.args.trim().split(/\s+/)
      const pattern = patternParts.join(' ')
      if (!permission || !pattern) renderError(`Uso: /${parsed.command} <permission> <pattern>`)
      else {
        await addPermissionRule(state.project.id, { permission: permission as PermissionCategory, pattern, action: parsed.command })
        renderNotice('Permissões', `Regra adicionada: ${parsed.command} ${permission} ${pattern}`)
      }
      return { handled: true, exit: false, state }
    }
    default:
      return { handled: true, exit: false, state }
  }
}

export async function runChat(config: OpenDeepConfig) {
  const rl = readline.createInterface({ input, output, historySize: 200 })
  const state = await initialState(config)
  renderHeader(state)

  try {
    while (true) {
      let text: string
      try {
        text = (await rl.question(chalk.bold('› '))).trim()
      } catch (error) {
        if (error instanceof Error && /readline was closed/i.test(error.message)) break
        throw error
      }
      if (!text) continue
      if (text.startsWith('/')) {
        const result = await handleSlash(text, state, config)
        if (result.exit) break
        continue
      }

      renderUserBubble(text)
      appendMessage(state.session, { role: 'user', content: text })
      try {
        const provider = createProvider(state.providerId, config)
        await runAgentTurn({ state, config, provider })
        state.session.provider = state.providerId
        state.session.model = state.model
        state.session.agent = state.agent
        await saveSession(state.session)
        state.project = await setProjectSession(state.project, state.session.id)
      } catch (error) {
        renderError(safeError(error))
      }
    }
  } finally {
    rl.close()
  }
}
