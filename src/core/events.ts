export type OpenDeepEvent =
  | { type: 'tool.started'; tool: string; title: string }
  | { type: 'tool.completed'; tool: string; title: string }
  | { type: 'permission.asked'; permission: string; pattern: string }
  | { type: 'file.edited'; filePath: string }

export type EventListener = (event: OpenDeepEvent) => void

const listeners = new Set<EventListener>()

export function publish(event: OpenDeepEvent) {
  for (const listener of listeners) listener(event)
}

export function subscribe(listener: EventListener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
