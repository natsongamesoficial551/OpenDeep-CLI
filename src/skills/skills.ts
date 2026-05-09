export interface SkillDefinition {
  name: string
  description: string
  prompt: string
}

export const BUILTIN_SKILLS: SkillDefinition[] = [
  { name: 'commit-message', description: 'Draft a concise git commit message', prompt: 'Analyze the current diff and write a concise commit message.' },
  { name: 'review', description: 'Review changes for correctness and security', prompt: 'Review the changes and identify correctness, security, and maintainability issues.' },
]
