import { getAgent } from '../agents/agents.js'
import { PermissionManager } from '../permissions/permissions.js'
import { ProviderAdapter, ChatRuntimeState, OpenDeepConfig, ChatMessage, ToolCall } from '../types.js'
import { renderAssistantBubble, renderToolCall, renderToolError, renderToolResult, renderNotice } from '../ui/chatRenderer.js'
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
    'You are OpenDeep, a terminal coding agent.',
    `Current project path: ${state.project.path}`,
    'Use tools when you need to inspect files, search code, edit files, create directories, or run commands.',
    'If the user explicitly asks you to create files or a project, do not stop after checking with glob/list; use mkdir and write to create the requested files.',
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
  renderToolCall(call)
  if (call.parseError) {
    const content = `Tool arguments JSON parse error: ${call.parseError}\nRaw arguments: ${call.rawArguments ?? ''}`
    renderToolError(call.name, content)
    return { role: 'tool', name: call.name, toolCallId: call.id, content }
  }

  try {
    const result = await runTool(call.name, call.arguments, ctx)
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

    const assistantMessage: ChatMessage = {
      role: 'assistant',
      content: response.content,
      ...(response.toolCalls?.length ? { toolCalls: response.toolCalls } : {}),
    }
    appendMessage(state.session, assistantMessage)
    if (response.content.trim()) {
      finalAnswer += response.content
      renderAssistantBubble(response.content)
    }

    if (!response.toolCalls?.length) {
      await saveSession(state.session)
      return finalAnswer
    }

    for (const call of response.toolCalls) {
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
