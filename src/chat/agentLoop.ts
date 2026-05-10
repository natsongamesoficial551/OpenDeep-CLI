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

const MAX_AGENT_ITERATIONS = 8
const WRITE_INTENT = /\b(cri(e|ar|a)|criar|crie|ger(e|ar)|gerar|fa(ç|c)a|fazer|write|create|edit|editar|modificar|salvar|arquivo|site|index\.html|style\.css|script\.js)\b/i

function hasWriteIntent(messages: ChatMessage[]) {
  const lastUser = [...messages].reverse().find((message) => message.role === 'user')
  return lastUser ? WRITE_INTENT.test(lastUser.content) : false
}

export function toolsForAgent(agentName: string, messages: ChatMessage[] = []): ToolDefinition[] {
  const effectiveAgent = hasWriteIntent(messages) ? getAgent('build') : getAgent(agentName)
  if (!effectiveAgent.tools) return [...BUILTIN_TOOLS]
  const allowed = new Set(effectiveAgent.tools)
  return BUILTIN_TOOLS.filter((tool) => allowed.has(tool.id))
}

function systemPrompt(state: ChatRuntimeState) {
  const agent = getAgent(state.agent)
  const writeIntent = hasWriteIntent(state.session.messages)
  return [
    agent.systemPrompt,
    '',
    'You are DeepCode, a terminal coding agent.',
    `Current project path: ${state.project.path}`,
    'Use tools when you need to inspect files, search code, edit files, create directories, or run commands.',
    'If native tool calls are unavailable and you must run a local command, output a JSON object like {"cmd":"<command>"}; DeepCode will execute it after the permission check. Do not merely describe commands when the user asked you to create or change files.',
    'If the user explicitly asks you to create files or a project, do not stop after checking with glob/list; use mkdir/write or an executable {"cmd":"..."} command to create the requested files for real.',
    'For requested static sites, create index.html, style.css, and script.js when asked, unless the user asks for a different structure.',
    writeIntent ? 'The latest user request appears to require writing/creating files, so write-capable tools are available for this turn.' : '',
    'Do not claim that you read, edited, searched, or ran anything unless you actually used a tool and received a tool result.',
    'Before editing existing files, read the relevant file first. For new files, use mkdir for directories and write for file contents.',
    'Respect permission prompts and never try to bypass safety checks.',
  ].filter(Boolean).join('\n')
}

function messagesWithSystem(state: ChatRuntimeState): ChatMessage[] {
  return [{ role: 'system', content: systemPrompt(state) }, ...state.session.messages]
}

function textualToolCommand(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const command = record.cmd ?? record.command
  if (typeof command === 'string' && command.trim()) return command.trim()
  const tool = record.tool ?? record.name
  const args = record.arguments ?? record.args
  if ((tool === 'bash' || tool === 'shell') && args && typeof args === 'object' && !Array.isArray(args)) {
    const argCommand = (args as Record<string, unknown>).command ?? (args as Record<string, unknown>).cmd
    if (typeof argCommand === 'string' && argCommand.trim()) return argCommand.trim()
  }
  return undefined
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

function commandToolCallsFromText(content: string): { calls: ToolCall[]; cleanedContent: string } {
  const objects = findJsonObjects(content)
  const commands = objects
    .map((item) => ({ ...item, command: textualToolCommand(item.value) }))
    .filter((item): item is { start: number; end: number; value: unknown; command: string } => typeof item.command === 'string')

  if (!commands.length) return { calls: [], cleanedContent: content }

  let cleanedContent = content
  for (const item of [...commands].reverse()) {
    cleanedContent = `${cleanedContent.slice(0, item.start)}${cleanedContent.slice(item.end)}`
  }
  cleanedContent = cleanedContent.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()

  return {
    cleanedContent,
    calls: commands.map((item, index) => ({
      id: `text_cmd_${Date.now()}_${index}`,
      name: 'bash',
      arguments: { command: item.command },
      rawArguments: JSON.stringify({ command: item.command }),
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

async function executeToolCall(call: ToolCall, ctx: ToolContext): Promise<ChatMessage> {
  const task = renderTaskStart(call.name, call.arguments)
  if (call.parseError) {
    const content = `Tool arguments JSON parse error: ${call.parseError}\nRaw arguments: ${call.rawArguments ?? ''}`
    renderTaskFinish(call.name, task.label, task.startedAt, 'error')
    renderToolError(call.name, content)
    return { role: 'tool', name: call.name, toolCallId: call.id, content }
  }

  try {
    const result = await runTool(call.name, call.arguments, ctx)
    renderTaskFinish(call.name, task.label, task.startedAt, 'done')
    renderToolResult(call.name, result)
    return {
      role: 'tool',
      name: call.name,
      toolCallId: call.id,
      content: result.output,
      metadata: result.metadata,
    }
  } catch (error) {
    const content = `Tool ${call.name} failed: ${safeError(error)}`
    renderTaskFinish(call.name, task.label, task.startedAt, ctx.signal?.aborted ? 'cancelled' : 'error')
    renderToolError(call.name, error)
    return { role: 'tool', name: call.name, toolCallId: call.id, content }
  }
}

async function fallbackTurn(provider: ProviderAdapter, state: ChatRuntimeState, config: OpenDeepConfig, signal?: AbortSignal) {
  const request = { messages: state.session.messages, model: state.model, ...(signal ? { signal } : {}) }
  if (config.ui.stream) {
    let answer = ''
    for await (const chunk of provider.stream(request)) answer += chunk
    renderAssistantBubble(answer)
    appendMessage(state.session, { role: 'assistant', content: answer })
    return answer
  }
  const answer = await provider.complete(request)
  renderAssistantBubble(answer)
  appendMessage(state.session, { role: 'assistant', content: answer })
  return answer
}

export async function runAgentTurn(input: { state: ChatRuntimeState; config: OpenDeepConfig; provider: ProviderAdapter; signal?: AbortSignal | undefined }) {
  const { state, config, provider, signal } = input
  const tools = toolsForAgent(state.agent, state.session.messages)
  if (!provider.completeWithTools || tools.length === 0) {
    return fallbackTurn(provider, state, config, signal)
  }

  const toolSpecs = toolsToSpecs(tools)
  const ctx = createToolContext(state, config, signal)
  let finalAnswer = ''

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
        return fallbackTurn(provider, state, config, signal)
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
    if (assistantContent.trim()) {
      finalAnswer += assistantContent
      renderAssistantBubble(assistantContent)
    }

    if (!toolCalls.length) {
      await saveSession(state.session)
      return finalAnswer
    }

    for (const call of toolCalls) {
      const toolMessage = await executeToolCall(call, ctx)
      appendMessage(state.session, toolMessage)
      await saveSession(state.session)
    }
  }

  const limitMessage = `Agent loop stopped after ${MAX_AGENT_ITERATIONS} tool iterations.`
  renderNotice('Agent loop', limitMessage)
  appendMessage(state.session, { role: 'assistant', content: limitMessage })
  await saveSession(state.session)
  return finalAnswer || limitMessage
}
