export interface AgentDefinition {
  name: string
  description: string
  systemPrompt: string
  tools?: string[]
}

export const BUILTIN_AGENTS: AgentDefinition[] = [
  { name: 'plan', description: 'Read-only planning and code exploration agent', systemPrompt: 'Plan carefully. Do not modify files.', tools: ['read_file', 'glob', 'grep'] },
  { name: 'build', description: 'Coding agent with local tools gated by permissions', systemPrompt: 'Implement requested software changes safely.', tools: ['read_file', 'write_file', 'grep', 'glob', 'bash', 'git_status'] },
  { name: 'general', description: 'General purpose research and multi-step assistant', systemPrompt: 'Help with broad research and implementation tasks.' },
]
