import readline from 'node:readline/promises'
import { emitKeypressEvents } from 'node:readline'
import { stdin as input, stdout as output } from 'node:process'
import chalk from 'chalk'
import { ChatRuntimeState, OpenDeepConfig, ProviderAdapter, ProviderConfig, SessionRecord, SlashCommand } from '../types.js'
import { createProvider, getProviderConfigs, resolveModel } from '../providers/registry.js'
import { safeError, redactObject } from '../security/redact.js'
import { formatClassifiedError } from '../core/errors.js'
import { renderCommandList, renderError, renderHeader, renderNotice, renderUserBubble } from '../ui/chatRenderer.js'
import { resolveSlash, searchSlashCommands, SLASH_COMMANDS } from '../commands/slash.js'
import { formatModelCatalog, modelsFor, normalizeModel, parseProviderModel } from '../providers/modelCatalog.js'
import { configureApiKey } from '../auth/auth.js'
import { appendMessage, createSession, formatSessionList, listSessions, loadSession, saveSession } from '../sessions/sessionStore.js'
import { formatProjectList, listProjects, setProjectSession, upsertProject } from '../projects/projectStore.js'
import { BUILTIN_AGENTS } from '../agents/agents.js'
import { doctor } from '../doctor.js'
import { formatPermissionRules, addPermissionRule, loadPermissionRules, PermissionCategory } from '../permissions/rules.js'
import { getSecret } from '../security/secrets.js'
import { saveConfig } from '../config/config.js'
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

type PromptReader = { question(query: string): Promise<string> }

const CTRL_C = String.fromCharCode(3)
const BACKSPACE = String.fromCharCode(8)
const ESC = String.fromCharCode(27)
const DEL = String.fromCharCode(127)
const BRACKETED_PASTE_START = `${ESC}[200~`
const BRACKETED_PASTE_END = `${ESC}[201~`
const ARROW_UP = `${ESC}[A`
const ARROW_DOWN = `${ESC}[B`
const ENABLE_BRACKETED_PASTE = `${ESC}[?2004h`
const DISABLE_BRACKETED_PASTE = `${ESC}[?2004l`

export type InputDraft = {
  buffer: string
  pastedChars: number
}

export function createInputDraft(): InputDraft {
  return { buffer: '', pastedChars: 0 }
}

function compactCharCount(chars: number) {
  if (chars >= 1_000_000) return `${(chars / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (chars >= 1_000) return `${(chars / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  return String(chars)
}

export function inputDraftDisplay(draft: InputDraft) {
  if (draft.pastedChars > 0) return `[Pasted ${compactCharCount(draft.pastedChars)} chars]`
  return draft.buffer
}

function appendPastedInput(draft: InputDraft, text: string) {
  draft.buffer += text
  draft.pastedChars += text.length
}

function appendTypedInput(draft: InputDraft, text: string) {
  draft.buffer += text
}

export function applyInputData(draft: InputDraft, data: string): { submit?: string; clear?: boolean } {
  if (!data) return {}
  if (data.includes(CTRL_C)) return { submit: '/exit' }
  if (data === ESC) {
    draft.buffer = ''
    draft.pastedChars = 0
    return { clear: true }
  }
  if (data === DEL || data === BACKSPACE) {
    draft.buffer = draft.buffer.slice(0, -1)
    if (draft.pastedChars > draft.buffer.length) draft.pastedChars = draft.buffer.length
    return {}
  }
  if (data === '\r' || data === '\n') return { submit: draft.buffer.trim() }

  let remaining = data
  while (remaining.includes(BRACKETED_PASTE_START)) {
    const start = remaining.indexOf(BRACKETED_PASTE_START)
    const end = remaining.indexOf(BRACKETED_PASTE_END, start)
    if (start > 0) appendTypedInput(draft, remaining.slice(0, start))
    if (end === -1) {
      appendPastedInput(draft, remaining.slice(start + BRACKETED_PASTE_START.length))
      return {}
    }
    appendPastedInput(draft, remaining.slice(start + BRACKETED_PASTE_START.length, end))
    remaining = remaining.slice(end + BRACKETED_PASTE_END.length)
  }

  if (!remaining) return {}
  if (remaining.length > 32 || /[\r\n]/.test(remaining)) appendPastedInput(draft, remaining.replace(/\r\n/g, '\n').replace(/\r/g, '\n'))
  else appendTypedInput(draft, remaining)
  return {}
}

type PickerState = {
  query: string
  selected: number
}

function optionList(items: string[]) {
  return items.map((item, index) => `${String(index + 1).padStart(2, '0')}. ${item}`).join('\n')
}

function formatSessionChoice(session: SessionRecord) {
  const date = session.updatedAt?.slice(0, 10) ?? 'sem data'
  return `${session.id.slice(0, 8)}  ${date}  ${session.title}  (${session.projectPath})`
}

function clearRenderedLines(lines: number) {
  for (let i = 0; i < lines; i += 1) output.write('\x1b[1A\r\x1b[2K')
}

async function pickByArrows(title: string, items: string[], emptyLabel = 'Nenhum item disponível') {
  if (!items.length || !input.isTTY) return undefined
  const stdin = input
  const wasRaw = stdin.isRaw
  emitKeypressEvents(stdin)
  stdin.setRawMode(true)
  stdin.resume()

  const state: PickerState = { query: '', selected: 0 }
  let drawn = 0

  const filtered = () => items
    .map((item, index) => ({ item, index }))
    .filter((entry) => entry.item.toLowerCase().includes(state.query.toLowerCase()))

  const render = () => {
    if (drawn) clearRenderedLines(drawn)
    const rows = filtered()
    const lines: string[] = [
      chalk.bold(`${title}  ${chalk.dim('(↑/↓ navega, Enter seleciona, Esc cancela)')}`),
      chalk.dim(`Filtro: ${state.query || '(vazio)'}`),
    ]
    if (!rows.length) lines.push(chalk.yellow(emptyLabel))
    else {
      const max = Math.min(rows.length, 8)
      if (state.selected >= max) state.selected = 0
      for (let i = 0; i < max; i += 1) {
        const prefix = i === state.selected ? chalk.green('›') : ' '
        lines.push(`${prefix} ${rows[i]?.item || ''}`)
      }
    }
    output.write(`\n${lines.join('\n')}\n`)
    drawn = lines.length + 1
  }

  render()
  try {
    return await new Promise<number | undefined>((resolve) => {
      const onKey = (_str: string, key: { name?: string; sequence?: string; ctrl?: boolean; meta?: boolean }) => {
        const rows = filtered()
        if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
          stdin.off('keypress', onKey)
          resolve(undefined)
          return
        }
        if (key.name === 'up') {
          if (rows.length) state.selected = (state.selected - 1 + Math.min(rows.length, 8)) % Math.min(rows.length, 8)
          render()
          return
        }
        if (key.name === 'down') {
          if (rows.length) state.selected = (state.selected + 1) % Math.min(rows.length, 8)
          render()
          return
        }
        if (key.name === 'backspace') {
          state.query = state.query.slice(0, -1)
          state.selected = 0
          render()
          return
        }
        if (key.name === 'return') {
          stdin.off('keypress', onKey)
          if (!rows.length) {
            resolve(undefined)
            return
          }
          resolve(rows[state.selected]?.index)
          return
        }
        const ch = key.sequence ?? ''
        if (ch && ch >= ' ' && ch !== '\u007f' && !key.ctrl && !key.meta) {
          state.query += ch
          state.selected = 0
          render()
        }
      }
      stdin.on('keypress', onKey)
    })
  } finally {
    if (drawn) clearRenderedLines(drawn)
    if (!wasRaw) stdin.setRawMode(false)
  }
}

async function readChatInput(rl: PromptReader) {
  if (!input.isTTY) return (await rl.question(chalk.bold('› '))).trim()
  const stdin = input
  const wasRaw = stdin.isRaw
  stdin.setRawMode(true)
  stdin.resume()

  const draft = createInputDraft()
  let selected = 0
  let drawn = 0

  const slashRows = () => {
    if (draft.pastedChars > 0 || !draft.buffer.startsWith('/') || draft.buffer.includes(' ')) return []
    return searchSlashCommands(draft.buffer.slice(1)).slice(0, 8)
  }

  const render = () => {
    if (drawn) clearRenderedLines(drawn)
    const rows = slashRows()
    const lines = [chalk.bold(`› ${inputDraftDisplay(draft)}`)]
    if (rows.length) {
      if (selected >= rows.length) selected = 0
      lines.push(chalk.dim('Comandos: ↑/↓ + Enter'))
      for (let i = 0; i < rows.length; i += 1) {
        const command = rows[i]
        if (!command) continue
        const prefix = i === selected ? chalk.green('›') : ' '
        lines.push(`${prefix} ${command.usage.padEnd(24)} ${chalk.dim(command.description)}`)
      }
    }
    output.write(`\n${lines.join('\n')}\n`)
    drawn = lines.length + 1
  }

  render()
  output.write(ENABLE_BRACKETED_PASTE)
  try {
    const text = await new Promise<string>((resolve) => {
      const finish = (value: string) => {
        stdin.off('data', onData)
        resolve(value)
      }
      const onData = (chunk: Buffer) => {
        const data = chunk.toString('utf8')
        const rows = slashRows()
        if (data === ARROW_UP) {
          if (rows.length) {
            selected = (selected - 1 + rows.length) % rows.length
            render()
          }
          return
        }
        if (data === ARROW_DOWN) {
          if (rows.length) {
            selected = (selected + 1) % rows.length
            render()
          }
          return
        }
        if ((data === '\r' || data === '\n') && rows.length && draft.buffer.startsWith('/') && !draft.buffer.includes(' ')) {
          const picked = rows[selected]
          finish(picked ? commandTemplate(picked) : draft.buffer.trim())
          return
        }
        const result = applyInputData(draft, data)
        selected = 0
        if (result.submit !== undefined) {
          finish(result.submit)
          return
        }
        render()
      }
      stdin.on('data', onData)
    })
    return text
  } finally {
    output.write(DISABLE_BRACKETED_PASTE)
    if (drawn) clearRenderedLines(drawn)
    if (!wasRaw) stdin.setRawMode(false)
    output.write('\n')
  }
}

async function pickByIndex(rl: PromptReader, title: string, items: string[]) {
  if (!items.length) return undefined
  renderNotice(title, optionList(items))
  const raw = (await rl.question(chalk.bold('Escolha pelo número (Enter cancela): '))).trim()
  if (!raw) return undefined
  const index = Number(raw)
  if (!Number.isInteger(index) || index < 1 || index > items.length) {
    renderError('Seleção inválida.')
    return undefined
  }
  return index - 1
}

async function configuredProviders(providers: ProviderConfig[]) {
  const configured: ProviderConfig[] = []
  for (const provider of providers) {
    if (!provider.apiKeyEnv) {
      configured.push(provider)
      continue
    }
    const secret = await getSecret(provider.apiKeyEnv)
    if (secret) configured.push(provider)
  }
  return configured
}

function commandTemplate(command: SlashCommand) {
  if (command.template) return command.template
  if (command.usage.includes('<') || command.usage.includes('[')) return `/${command.name} `
  return `/${command.name}`
}

async function selectSlashCommand(rl: PromptReader) {
  const filter = (await rl.question(chalk.bold('Filtro de comando (Enter para todos): '))).trim()
  const commands = searchSlashCommands(filter)
  if (!commands.length) {
    renderError('Nenhum comando encontrado.')
    return undefined
  }
  const idx = await pickByIndex(rl, 'Comandos', commands.map((command) => `${command.usage.padEnd(28)} ${command.description}`))
  if (idx === undefined) return undefined
  const selected = commands[idx]
  if (!selected) return undefined
  if (selected.usage.includes('<') || selected.usage.includes('[')) {
    const args = (await rl.question(chalk.bold(`Argumentos para ${selected.usage}: `))).trim()
    if (args.startsWith('/')) return args
    return `/${selected.name}${args ? ` ${args}` : ''}`
  }
  return commandTemplate(selected)
}

async function selectProvider(rl: PromptReader, providers: ProviderConfig[], title = 'Selecione o provider') {
  const idx = await pickByIndex(
    rl,
    title,
    providers.map((provider) => `${provider.id.padEnd(14)} ${provider.name.padEnd(22)} ${provider.defaultModel}`),
  )
  if (idx === undefined) return undefined
  return providers[idx]
}

async function selectModel(rl: PromptReader, provider: ProviderConfig) {
  const models = modelsFor(provider)
  const idx = await pickByIndex(rl, `Modelos de ${provider.id}`, models)
  if (idx === undefined) return undefined
  return models[idx]
}

function cleanProviderModel(providerId: string, model: string) {
  return providerId === 'nvidia' && model.startsWith('nvidia/') ? model.slice('nvidia/'.length) : model
}

async function applyProviderModel(state: ChatRuntimeState, providerId: string, model: string) {
  state.providerId = providerId
  state.model = normalizeModel(providerId, cleanProviderModel(providerId, model))
  state.session.provider = state.providerId
  state.session.model = state.model
  state.session.messages = []
  await saveSession(state.session)
  renderNotice('Provider/model alterado', `${state.providerId}/${state.model}\nContexto limpo para evitar mistura de contexto entre modelos.`)
}

async function handleSlash(text: string, state: ChatRuntimeState, config: OpenDeepConfig, rl: PromptReader) {
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
    case 'codex': {
      const provider = providers.find((item) => item.id === 'codex-oauth')
      if (!provider) {
        renderError('Provider codex-oauth não encontrado.')
        return { handled: true, exit: false, state }
      }
      renderNotice('Codex', await configureApiKey(provider))
      if (!(await getSecret('CODEX_OAUTH_TOKEN'))) {
        renderError('OAuth Codex não configurado.')
        return { handled: true, exit: false, state }
      }
      await applyProviderModel(state, 'codex-oauth', process.env.CODEX_MODEL ?? 'gpt-5.5')
      return { handled: true, exit: false, state }
    }
    case 'provider': {
      const id = parsed.args.trim()
      let provider = id ? providers.find((item) => item.id === id) : undefined
      if (!provider && !id) provider = await selectProvider(rl, providers)
      if (!provider) {
        if (id) renderError(`Provider não encontrado: ${id}`)
        return { handled: true, exit: false, state }
      }
      if (provider.apiKeyEnv && !(await getSecret(provider.apiKeyEnv))) {
        renderNotice('API', await configureApiKey(provider))
        if (!(await getSecret(provider.apiKeyEnv))) {
          renderError(`API key não configurada para ${provider.id}.`)
          return { handled: true, exit: false, state }
        }
      }
      const chosenModel = await selectModel(rl, provider)
      const model = chosenModel ?? normalizeModel(provider.id, resolveModel(provider) || provider.defaultModel)
      await applyProviderModel(state, provider.id, model)
      return { handled: true, exit: false, state }
    }

    case 'api':
    case 'login': {
      const id = parsed.args.trim() || state.providerId
      const provider = providers.find((item) => item.id === id)
      if (!provider) renderError(`Provider não encontrado: ${id}`)
      else {
        renderNotice('API', await configureApiKey(provider))
        if (provider.id === 'codex-oauth') {
          if (await getSecret('CODEX_OAUTH_TOKEN')) await applyProviderModel(state, 'codex-oauth', process.env.CODEX_MODEL ?? 'gpt-5.5')
          else renderError('OAuth Codex não configurado.')
        }
      }
      return { handled: true, exit: false, state }
    }
    case 'models': {
      const raw = parsed.args.trim()
      if (!raw) {
        const list = await configuredProviders(providers)
        renderNotice('Modelos', formatModelCatalog(list.length ? list : providers, undefined))
        return { handled: true, exit: false, state }
      }
      if (raw === 'all') {
        renderNotice('Modelos', formatModelCatalog(providers))
        return { handled: true, exit: false, state }
      }
      renderNotice('Modelos', formatModelCatalog(providers, raw))
      return { handled: true, exit: false, state }
    }
    case 'model': {
      const args = parsed.args.trim()
      if (!args) {
        const provider = providers.find((item) => item.id === state.providerId)
        if (!provider) {
          renderError(`Provider atual inválido: ${state.providerId}`)
          return { handled: true, exit: false, state }
        }
        if (provider.apiKeyEnv && !(await getSecret(provider.apiKeyEnv))) {
          renderNotice('API', await configureApiKey(provider))
          if (!(await getSecret(provider.apiKeyEnv))) {
            renderError(`API key não configurada para ${provider.id}.`)
            return { handled: true, exit: false, state }
          }
        }
        const chosen = await selectModel(rl, provider)
        if (chosen) await applyProviderModel(state, provider.id, chosen)
        return { handled: true, exit: false, state }
      }
      const next = parseProviderModel(args, state.providerId)
      const provider = next ? providers.find((item) => item.id === next.providerId) : undefined
      if (!next || !provider) renderError('Uso: /model provider/model ou /model modelo')
      else await applyProviderModel(state, next.providerId, next.model)
      return { handled: true, exit: false, state }
    }
    case 'use': {
      const args = parsed.args.trim()
      if (!args) {
        const provider = await selectProvider(rl, providers, 'Selecione provider para /use')
        if (!provider) return { handled: true, exit: false, state }
        if (provider.apiKeyEnv && !(await getSecret(provider.apiKeyEnv))) {
          renderNotice('API', await configureApiKey(provider))
          if (!(await getSecret(provider.apiKeyEnv))) {
            renderError(`API key não configurada para ${provider.id}.`)
            return { handled: true, exit: false, state }
          }
        }
        const chosen = await selectModel(rl, provider)
        await applyProviderModel(state, provider.id, chosen ?? provider.defaultModel)
        return { handled: true, exit: false, state }
      }
      const explicitProvider = args.includes('/') ? undefined : providers.find((item) => item.id === args)
      const parsedUse = explicitProvider ? { providerId: explicitProvider.id, model: '' } : parseProviderModel(args, state.providerId)
      const provider = parsedUse ? providers.find((item) => item.id === parsedUse.providerId) : undefined
      if (!parsedUse || !provider) {
        renderError('Uso: /use <provider> ou /use <provider/model>')
        return { handled: true, exit: false, state }
      }
      if (provider.apiKeyEnv && !(await getSecret(provider.apiKeyEnv))) {
        renderNotice('API', await configureApiKey(provider))
        if (!(await getSecret(provider.apiKeyEnv))) {
          renderError(`API key não configurada para ${provider.id}.`)
          return { handled: true, exit: false, state }
        }
      }
      const chosen = parsedUse.model ? parsedUse.model : (await selectModel(rl, provider)) ?? provider.defaultModel
      await applyProviderModel(state, provider.id, chosen)
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
    case 'sessions': {
      const sessions = await listSessions()
      if (input.isTTY && sessions.length) {
        const idx = await pickByArrows('Sessões antigas', sessions.map(formatSessionChoice), 'Nenhuma sessão encontrada')
        if (idx !== undefined) {
          const picked = sessions[idx]
          if (picked) {
            state.project = await upsertProject(picked.projectPath)
            state.session = picked
            state.providerId = picked.provider
            state.model = picked.model
            state.agent = picked.agent ?? 'general'
            state.project = await setProjectSession(state.project, picked.id)
            renderHeader(state)
            return { handled: true, exit: false, state }
          }
        }
      }
      renderNotice('Sessões', formatSessionList(sessions))
      return { handled: true, exit: false, state }
    }
    case 'continue':
      renderHeader(state)
      return { handled: true, exit: false, state }
    case 'session': {
      const id = parsed.args.trim()
      const sessions = await listSessions()
      if (!id) {
        const idx = await pickByArrows('Sessões antigas', sessions.map(formatSessionChoice), 'Nenhuma sessão encontrada')
        if (idx === undefined) return { handled: true, exit: false, state }
        const picked = sessions[idx]
        if (!picked) return { handled: true, exit: false, state }
        state.project = await upsertProject(picked.projectPath)
        state.session = picked
        state.providerId = picked.provider
        state.model = picked.model
        state.agent = picked.agent ?? 'general'
        state.project = await setProjectSession(state.project, picked.id)
        renderHeader(state)
        return { handled: true, exit: false, state }
      }
      const session = sessions.find((item) => item.id === id || item.id.startsWith(id))
      if (!session) renderError(`Sessão não encontrada: ${id}`)
      else {
        state.project = await upsertProject(session.projectPath)
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
      renderNotice('Permissões', [
        `allowAll      ${config.permissions.allowAll ? 'ON — sem prompts, inclusive comandos destrutivos' : 'off'}`,
        `autoAllow     ${config.permissions.autoAllow ? 'on' : 'off'}`,
        '',
        formatPermissionRules(await loadPermissionRules(state.project.id)),
      ].join('\n'))
      return { handled: true, exit: false, state }
    case 'allowall': {
      const arg = parsed.args.trim().toLowerCase()
      if (!arg || arg === 'status') {
        renderNotice('AllowAll', config.permissions.allowAll
          ? 'ON — DeepCode não perguntará permissão para nenhuma tool/comando. Use /allowall off para desligar.'
          : 'off — DeepCode continua pedindo permissões quando necessário. Use /allowall on para liberar tudo.')
        return { handled: true, exit: false, state }
      }
      if (!['on', 'off', 'true', 'false', '1', '0', 'yes', 'no'].includes(arg)) {
        renderError('Uso: /allowall [on|off|status]')
        return { handled: true, exit: false, state }
      }
      const enabled = ['on', 'true', '1', 'yes'].includes(arg)
      config.permissions.allowAll = enabled
      if (enabled) {
        config.permissions.autoAllow = true
        config.permissions.allowShell = true
        config.permissions.allowWrite = true
        config.permissions.allowNetwork = true
      }
      await saveConfig(config)
      renderNotice('AllowAll', enabled
        ? 'ON — todos os comandos/tools da IA serão permitidos sem perguntar. Cuidado: isso inclui comandos destrutivos solicitados pelo modelo.'
        : 'off — permissões voltaram ao modo seguro/configurado.')
      return { handled: true, exit: false, state }
    }
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

function watchAbortKey(controller: AbortController) {
  if (!process.stdin.isTTY) return () => {}
  const stdin = process.stdin
  const wasRaw = stdin.isRaw
  const onData = (chunk: Buffer) => {
    const text = chunk.toString('utf8')
    if (text.includes('\u001b') || text.includes('\u0003')) controller.abort()
  }
  stdin.setRawMode(true)
  stdin.resume()
  stdin.on('data', onData)
  return () => {
    stdin.off('data', onData)
    if (!wasRaw) stdin.setRawMode(false)
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
        text = await readChatInput(rl)
      } catch (error) {
        if (error instanceof Error && /readline was closed/i.test(error.message)) break
        throw error
      }
      if (!text) continue
      if (text.startsWith('/')) {
        const result = await handleSlash(text, state, config, rl)
        if (result.exit) break
        continue
      }

      renderUserBubble(text)
      appendMessage(state.session, { role: 'user', content: text })
      try {
        const provider = createProvider(state.providerId, config)
        const controller = new AbortController()
        const stopWatchingAbort = watchAbortKey(controller)
        try {
          await runAgentTurn({ state, config, provider, signal: controller.signal })
        } finally {
          stopWatchingAbort()
        }
        state.session.provider = state.providerId
        state.session.model = state.model
        state.session.agent = state.agent
        await saveSession(state.session)
        state.project = await setProjectSession(state.project, state.session.id)
      } catch (error) {
        if (error instanceof Error && /abort/i.test(error.name + error.message)) renderNotice('Interrompido', 'Resposta interrompida pelo usuário.')
        else renderError(formatClassifiedError(error))
      }
    }
  } finally {
    rl.close()
  }
}
