export interface HookDefinition {
  event: 'beforeTool' | 'afterTool' | 'beforePrompt' | 'afterResponse'
  command: string
}

export function validateHook(hook: HookDefinition) {
  if (!hook.command.trim()) throw new Error('Hook command cannot be empty')
  return hook
}
