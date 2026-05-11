export type AgentEventType =
  | 'turn.started'
  | 'assistant.message'
  | 'tool.started'
  | 'tool.completed'
  | 'tool.failed'
  | 'turn.completed'
  | 'turn.failed'

export interface AgentEvent {
  type: AgentEventType
  sessionId: string
  sequence: number
  timestamp: string
  [key: string]: unknown
}

export type AgentEventSink = (event: AgentEvent) => void | Promise<void>

export function createAgentEventEmitter(input: { sessionId: string; onEvent?: AgentEventSink | undefined }) {
  let sequence = 0
  return async (type: AgentEventType, fields: Record<string, unknown> = {}) => {
    const event: AgentEvent = {
      type,
      sessionId: input.sessionId,
      sequence: ++sequence,
      timestamp: new Date().toISOString(),
      ...fields,
    }
    await input.onEvent?.(event)
    return event
  }
}

export function formatAgentEventJsonl(event: AgentEvent) {
  return `${JSON.stringify(event)}\n`
}
