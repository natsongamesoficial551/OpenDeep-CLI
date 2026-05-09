export interface AgentDefinition {
  name: string
  description: string
  systemPrompt: string
  tools?: string[]
}

export const BUILTIN_AGENTS: AgentDefinition[] = [
  { name: 'plan', description: 'Read-only planning and code exploration agent', systemPrompt: 'Plan carefully. Do not modify files unless explicitly instructed.', tools: ['read', 'list', 'glob', 'grep', 'git_status', 'git_diff', 'git_log'] },
  { name: 'build', description: 'Coding agent with local tools gated by permissions', systemPrompt: 'Implement requested software changes safely. Read files before editing, create directories with mkdir when needed, prefer exact edits, and respect permission prompts.', tools: ['read', 'list', 'mkdir', 'write', 'edit', 'grep', 'glob', 'bash', 'git_status', 'git_diff', 'git_log', 'web_fetch'] },
  { name: 'general', description: 'General purpose research and multi-step assistant', systemPrompt: 'Help with broad research and implementation tasks. Use tools when you need to inspect or change local project state.' },
]

export function getAgent(name: string) {
  return BUILTIN_AGENTS.find((agent) => agent.name === name) ?? BUILTIN_AGENTS.find((agent) => agent.name === 'general')!
}
