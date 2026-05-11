import { getAgent } from '../agents/agents.js'
import { PermissionManager } from '../permissions/permissions.js'
import { ProviderAdapter, ChatRuntimeState, OpenDeepConfig, ChatMessage, ToolCall } from '../types.js'
import { renderAssistantBubble, renderToolError, renderToolResult, renderNotice } from '../ui/chatRenderer.js'
import { renderTaskFinish, renderTaskStart } from '../ui/taskTracker.js'
import { appendMessage, saveSession } from '../sessions/sessionStore.js'
import { BUILTIN_TOOLS, runTool } from '../tools/registry.js'
import { toolsToSpecs } from '../tools/providerSchema.js'
import { ToolDefinition, ToolContext } from '../tools/tool.js'
import { safeError } from '../security/redact.js'
import { AgentEventSink, createAgentEventEmitter } from '../core/agentEvents.js'

const MAX_AGENT_ITERATIONS = 40
const WRITE_INTENT = /\b(cri(e|ar|a)|criar|crie|ger(e|ar)|gerar|fa(ç|c)a|fazer|write|create|edit|editar|modificar|salvar|arquivo|site|index\.html|style\.css|script\.js)\b/i
const TEXT_TOOL_ALIASES: Record<string, string> = { shell: 'bash', command: 'bash' }

const AUTONOMOUS_VERIFICATION_POLICY = [
  'Autonomous verification policy:',
  '- Work like a production autonomous coding agent: inspect first, implement with real tool calls, then verify locally before finalizing.',
  '- For code changes, infer and run local tests/builds/lints from the project: npm/pnpm/yarn/bun scripts for JS/TS, pytest/unittest/ruff/mypy for Python, cargo test for Rust, go test for Go, or the closest available command.',
  '- For HTML/static/frontend/web apps, run or start the app with bash/run_background when needed, then use browser_check against the local URL or file-served page to catch console errors, network failures, and broken rendering. Stop background jobs with job_stop after validation.',
  '- Use web_fetch to consult current docs/examples when APIs, package behavior, errors, or setup steps are uncertain. Prefer official documentation when available.',
  '- If any test/build/lint/browser/tool check fails, do not stop at the first failure: read the full error, fix the root cause, edit the code, then rerun the relevant check. Repeat until the checks pass or you hit a real external blocker.',
  '- Do not claim success until the changed feature was actually tested. In the final answer, report exactly which checks passed and mention any check that could not be run with the reason.',
].join('\n')

function effectiveAgentForTurn(agentName: string, messages: ChatMessage[] = []) {
  return hasWriteIntent(messages) ? getAgent('build') : getAgent(agentName)
}
function hasWriteIntent(messages: ChatMessage[]) {
  const lastUser = [...messages].reverse().find((message) => message.role === 'user')
  return lastUser ? WRITE_INTENT.test(lastUser.content) : false
}

export function toolsForAgent(agentName: string, messages: ChatMessage[] = []): ToolDefinition[] {
  const effectiveAgent = effectiveAgentForTurn(agentName, messages)
  if (!effectiveAgent.tools) return [...BUILTIN_TOOLS]
  const allowed = new Set(effectiveAgent.tools)
  return BUILTIN_TOOLS.filter((tool) => allowed.has(tool.id))
}

function systemPrompt(state: ChatRuntimeState) {
  const agent = effectiveAgentForTurn(state.agent, state.session.messages)
  const writeIntent = hasWriteIntent(state.session.messages)
  return [
    agent.systemPrompt,
    '',
    'You are DeepCode, a terminal coding agent.',
    `Current project path: ${state.project.path}`,
    'Use tools when you need to inspect files, search code, edit files, create directories, or run commands.',
    'Prefer native tools for filesystem work: mkdir for folders, write for new/complete files, edit for targeted changes. Do NOT use PowerShell/cmd/bash to write long file contents when write is available.',
    'On Windows, avoid long powershell -Command/heredoc commands for generated files. They commonly fail with command-line length or string terminator errors. Split work into multiple write tool calls instead.',
    'If native tool calls are unavailable and you must call a tool from text, output compact JSON for the real tool, for example {"tool":"write","args":{"filePath":"index.html","content":"..."}} or {"tool":"mkdir","args":{"dirPath":"site"}}. Use {"cmd":"<command>"} only for short shell commands.',
    'Do not merely describe commands when the user asked you to create or change files; actually call tools.',
    'If the user explicitly asks you to create files or a project, do not stop after checking with glob/list; use mkdir/write/edit tool calls to create the requested files for real.',
    'For requested static sites, create index.html, style.css, and script.js when asked, unless the user asks for a different structure.',
    writeIntent ? 'The latest user request appears to require writing/creating files, so write-capable tools are available for this turn.' : '',
    writeIntent ? AUTONOMOUS_VERIFICATION_POLICY : '',
    'Do not claim that you read, edited, searched, or ran anything unless you actually used a tool and received a tool result.',
    'Before editing existing files, read the relevant file first. For new files, use mkdir for directories and write for file contents.',
    'Respect permission prompts and never try to bypass safety checks.',
  ].filter(Boolean).join('\n')
}

function messagesWithSystem(state: ChatRuntimeState): ChatMessage[] {
  return [{ role: 'system', content: systemPrompt(state) }, ...state.session.messages]
}

function normalizeTextToolArgs(toolName: string, args: unknown) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return args
  const record = { ...(args as Record<string, unknown>) }

  if (toolName === 'write') {
    const filePath = record.filePath ?? record.file_path ?? record.path ?? record.filename
    if (typeof filePath === 'string') record.filePath = filePath
    delete record.file_path
    delete record.path
    delete record.filename
  }

  if (toolName === 'mkdir') {
    const dirPath = record.dirPath ?? record.dir_path ?? record.path ?? record.directory
    if (typeof dirPath === 'string') record.dirPath = dirPath
    delete record.dir_path
    delete record.path
    delete record.directory
  }

  if (toolName === 'bash') {
    const command = record.command ?? record.cmd
    if (typeof command === 'string') record.command = command
    delete record.cmd
  }

  return record
}

function textualToolCall(value: unknown): Omit<ToolCall, 'id' | 'rawArguments'> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const directCommand = record.cmd ?? record.command
  if (typeof directCommand === 'string' && directCommand.trim()) {
    return { name: 'bash', arguments: { command: directCommand.trim() } }
  }

  const rawToolName = record.tool ?? record.name
  if (typeof rawToolName !== 'string' || !rawToolName.trim()) return undefined
  const aliasedName = TEXT_TOOL_ALIASES[rawToolName.trim()] ?? rawToolName.trim()
  if (!BUILTIN_TOOLS.some((tool) => tool.id === aliasedName)) return undefined

  const args = record.arguments ?? record.args ?? record.input ?? {}
  return { name: aliasedName, arguments: normalizeTextToolArgs(aliasedName, args) }
}

function findJsonObjects(text: string) {
  const found: Array<{ start: number; end: number; value: unknown }> = []
  for (let start = text.indexOf('{'); start >= 0; start = text.indexOf('{', start + 1)) {
    let depth = 0
    let inString = false
    let escaped = false
    for (let index = start; index < text.length; index += 1) {
      const char = text[index]
      if (inString) {
        if (escaped) escaped = false
        else if (char === '\\') escaped = true
        else if (char === '"') inString = false
        continue
      }
      if (char === '"') {
        inString = true
        continue
      }
      if (char === '{') depth += 1
      else if (char === '}') {
        depth -= 1
        if (depth === 0) {
          const end = index + 1
          try {
            found.push({ start, end, value: JSON.parse(text.slice(start, end)) })
          } catch {}
          break
        }
      }
    }
  }
  return found
}

export function commandToolCallsFromText(content: string): { calls: ToolCall[]; cleanedContent: string } {
  const objects = findJsonObjects(content)
  const toolObjects = objects
    .map((item) => ({ ...item, call: textualToolCall(item.value) }))
    .filter((item): item is { start: number; end: number; value: unknown; call: Omit<ToolCall, 'id' | 'rawArguments'> } => !!item.call)

  if (!toolObjects.length) return { calls: [], cleanedContent: content }

  let cleanedContent = content
  for (const item of [...toolObjects].reverse()) {
    cleanedContent = `${cleanedContent.slice(0, item.start)}${cleanedContent.slice(item.end)}`
  }
  cleanedContent = cleanedContent.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()

  return {
    cleanedContent,
    calls: toolObjects.map((item, index) => ({
      id: `text_tool_${Date.now()}_${index}`,
      name: item.call.name,
      arguments: item.call.arguments,
      rawArguments: JSON.stringify(item.call.arguments),
    })),
  }
}

function createToolContext(state: ChatRuntimeState, config: OpenDeepConfig, signal?: AbortSignal): ToolContext {
  return {
    cwd: state.project.path,
    sessionId: state.session.id,
    agent: state.agent,
    permissions: new PermissionManager(config, state.project.id),
    signal,
    metadata: async () => {},
  }
}

async function executeToolCall(call: ToolCall, ctx: ToolContext, statusContext: { providerId: string; model: string; taskIndex: number; render: boolean }, emit?: ReturnType<typeof createAgentEventEmitter>): Promise<ChatMessage> {
  const task = statusContext.render
    ? renderTaskStart(call.name, call.arguments, statusContext)
    : { label: call.name, startedAt: Date.now(), context: statusContext }
  await emit?.('tool.started', { tool: call.name, callId: call.id, arguments: call.arguments, taskIndex: statusContext.taskIndex })
  if (call.parseError) {
    const content = `Tool arguments JSON parse error: ${call.parseError}\nRaw arguments: ${call.rawArguments ?? ''}`
    if (statusContext.render) {
      renderTaskFinish(call.name, task.label, task.startedAt, 'error', task.context)
      renderToolError(call.name, content)
    }
    await emit?.('tool.failed', { tool: call.name, callId: call.id, status: 'error', error: content, taskIndex: statusContext.taskIndex })
    return { role: 'tool', name: call.name, toolCallId: call.id, content }
  }

  try {
    const result = await runTool(call.name, call.arguments, ctx)
    if (statusContext.render) {
      renderTaskFinish(call.name, task.label, task.startedAt, 'done', task.context)
      renderToolResult(call.name, result)
    }
    await emit?.('tool.completed', { tool: call.name, callId: call.id, status: 'done', title: result.title, output: result.output, metadata: result.metadata, taskIndex: statusContext.taskIndex })
    return {
      role: 'tool',
      name: call.name,
      toolCallId: call.id,
      content: result.output,
      metadata: result.metadata,
    }
  } catch (error) {
    const content = `Tool ${call.name} failed: ${safeError(error)}`
    if (statusContext.render) {
      renderTaskFinish(call.name, task.label, task.startedAt, ctx.signal?.aborted ? 'cancelled' : 'error', task.context)
      renderToolError(call.name, error)
    }
    await emit?.('tool.failed', { tool: call.name, callId: call.id, status: ctx.signal?.aborted ? 'cancelled' : 'error', error: content, taskIndex: statusContext.taskIndex })
    return { role: 'tool', name: call.name, toolCallId: call.id, content }
  }
}

async function fallbackTurn(provider: ProviderAdapter, state: ChatRuntimeState, config: OpenDeepConfig, signal?: AbortSignal, render = true) {
  const request = { messages: state.session.messages, model: state.model, ...(signal ? { signal } : {}) }
  if (config.ui.stream) {
    let answer = ''
    for await (const chunk of provider.stream(request)) answer += chunk
    if (render) renderAssistantBubble(answer)
    appendMessage(state.session, { role: 'assistant', content: answer })
    return answer
  }
  const answer = await provider.complete(request)
  if (render) renderAssistantBubble(answer)
  appendMessage(state.session, { role: 'assistant', content: answer })
  return answer
}

export async function runAgentTurn(input: { state: ChatRuntimeState; config: OpenDeepConfig; provider: ProviderAdapter; signal?: AbortSignal | undefined; onEvent?: AgentEventSink | undefined; render?: boolean | undefined }) {
  const { state, config, provider, signal, onEvent } = input
  const render = input.render !== false
  const emit = createAgentEventEmitter({ sessionId: state.session.id, onEvent })
  await emit('turn.started', { providerId: state.providerId, model: state.model, agent: state.agent })

  try {
    const tools = toolsForAgent(state.agent, state.session.messages)
    if (!provider.completeWithTools || tools.length === 0) {
      const answer = await fallbackTurn(provider, state, config, signal, render)
      await emit('assistant.message', { content: answer, toolCalls: [] })
      await emit('turn.completed', { status: 'done', answer })
      return answer
    }

    const toolSpecs = toolsToSpecs(tools)
    const ctx = createToolContext(state, config, signal)
    let finalAnswer = ''
    let taskIndex = state.session.messages.filter((message) => message.role === 'tool').length

    for (let iteration = 0; iteration < MAX_AGENT_ITERATIONS; iteration += 1) {
      let response
      try {
        response = await provider.completeWithTools({
          messages: messagesWithSystem(state),
          model: state.model,
          tools: toolSpecs,
          toolChoice: 'auto',
          ...(signal ? { signal } : {}),
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (/tool_choice|auto tool choice|tool-call-parser|enable-auto-tool-choice/i.test(message)) {
          const answer = await fallbackTurn(provider, state, config, signal, render)
          await emit('assistant.message', { content: answer, toolCalls: [] })
          await emit('turn.completed', { status: 'done', answer, fallback: 'tool_choice_rejected' })
          return answer
        }
        throw error
      }

      const textualCommands = commandToolCallsFromText(response.content)
      const toolCalls = response.toolCalls?.length ? response.toolCalls : textualCommands.calls
      const assistantContent = response.toolCalls?.length ? response.content : textualCommands.cleanedContent

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: assistantContent,
        ...(toolCalls.length ? { toolCalls } : {}),
      }
      appendMessage(state.session, assistantMessage)
      await emit('assistant.message', { content: assistantContent, toolCalls: toolCalls.map((call) => ({ id: call.id, name: call.name, arguments: call.arguments })) })
      if (assistantContent.trim()) {
        finalAnswer += assistantContent
        if (render) renderAssistantBubble(assistantContent)
      }

      if (!toolCalls.length) {
        await saveSession(state.session)
        await emit('turn.completed', { status: 'done', answer: finalAnswer })
        return finalAnswer
      }

      for (const call of toolCalls) {
        taskIndex += 1
        const toolMessage = await executeToolCall(call, ctx, { providerId: state.providerId, model: state.model, taskIndex, render }, emit)
        appendMessage(state.session, toolMessage)
        await saveSession(state.session)
      }
    }

    const limitMessage = `Agent loop stopped after ${MAX_AGENT_ITERATIONS} tool iterations.`
    if (render) renderNotice('Agent loop', limitMessage)
    appendMessage(state.session, { role: 'assistant', content: limitMessage })
    await saveSession(state.session)
    await emit('turn.completed', { status: 'max_iterations', answer: finalAnswer || limitMessage })
    return finalAnswer || limitMessage
  } catch (error) {
    await emit('turn.failed', { status: 'error', error: safeError(error) })
    throw error
  }
}
