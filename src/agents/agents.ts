import { existsSync, readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getConfigDirs } from '../config/paths.js'

export interface AgentDefinition {
  name: string
  description: string
  systemPrompt: string
  model?: string | undefined
  providerId?: string | undefined
  tools?: string[]
}

export const MIN_AGENTS = 3
export const MAX_AGENTS = 12

export const BUILTIN_AGENTS: AgentDefinition[] = [
  { name: 'plan', description: 'Read-only planning and code exploration agent', systemPrompt: 'Plan carefully. Do not modify files unless explicitly instructed.', tools: ['read', 'list', 'glob', 'grep', 'git_status', 'git_diff', 'git_log'] },
  {
    name: 'build',
    description: 'Coding agent with local tools gated by permissions',
    systemPrompt: 'Implement requested software changes safely. Read files before editing, create directories with mkdir when needed, prefer exact edits, and respect permission prompts. When validating local web apps, run build/test/lint first when available, start dev servers with run_background, inspect logs with job_status, use browser_check to collect console/network/page errors, and stop jobs with job_stop when finished.',
    tools: ['read', 'list', 'mkdir', 'write', 'edit', 'grep', 'glob', 'bash', 'run_background', 'job_status', 'job_stop', 'git_status', 'git_diff', 'git_log', 'web_fetch', 'browser_check'],
  },
  { name: 'general', description: 'General purpose research and multi-step assistant', systemPrompt: 'Help with broad research and implementation tasks. Use tools when you need to inspect or change local project state.' },
]

function agentsFile() {
  return join(getConfigDirs().config, 'agents.json')
}

function normalizeAgent(agent: AgentDefinition): AgentDefinition {
  return {
    name: agent.name.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, ''),
    description: agent.description.trim(),
    systemPrompt: agent.systemPrompt.trim(),
    ...(agent.model?.trim() ? { model: agent.model.trim() } : {}),
    ...(agent.providerId?.trim() ? { providerId: agent.providerId.trim() } : {}),
    ...(agent.tools?.length ? { tools: agent.tools } : {}),
  }
}

function readCustomAgents(): AgentDefinition[] {
  const file = agentsFile()
  if (!existsSync(file)) return []
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as AgentDefinition[]
    if (!Array.isArray(parsed)) return []
    return parsed.map(normalizeAgent).filter((agent) => agent.name && agent.description && agent.systemPrompt)
  } catch {
    return []
  }
}

async function writeCustomAgents(agents: AgentDefinition[]) {
  await mkdir(getConfigDirs().config, { recursive: true })
  await writeFile(agentsFile(), JSON.stringify(agents.map(normalizeAgent), null, 2))
}

export function listAgents() {
  const custom = readCustomAgents().filter((agent) => !BUILTIN_AGENTS.some((builtin) => builtin.name === agent.name))
  return [...BUILTIN_AGENTS, ...custom].slice(0, MAX_AGENTS)
}

export function validateAgentLimit(currentCount: number, updatingExisting: boolean) {
  if (!updatingExisting && currentCount >= MAX_AGENTS) throw new Error(`Você atingiu o máximo de ${MAX_AGENTS} agentes.`)
  if (currentCount < MIN_AGENTS) throw new Error(`DeepCode precisa manter no mínimo ${MIN_AGENTS} agentes.`)
}

export async function saveCustomAgent(agent: AgentDefinition) {
  const nextAgent = normalizeAgent(agent)
  if (!nextAgent.name) throw new Error('Nome do agente é obrigatório.')
  if (!nextAgent.description) throw new Error('Descrição do agente é obrigatória.')
  if (!nextAgent.systemPrompt) throw new Error('Prompt/instrução do agente é obrigatório.')
  if (BUILTIN_AGENTS.some((builtin) => builtin.name === nextAgent.name)) throw new Error(`Agente builtin não pode ser sobrescrito: ${nextAgent.name}`)
  const custom = readCustomAgents()
  const updating = custom.some((item) => item.name === nextAgent.name)
  validateAgentLimit(BUILTIN_AGENTS.length + custom.length, updating)
  await writeCustomAgents([nextAgent, ...custom.filter((item) => item.name !== nextAgent.name)])
  return nextAgent
}

export async function removeCustomAgent(name: string) {
  const normalized = normalizeAgent({ name, description: 'x', systemPrompt: 'x' }).name
  if (BUILTIN_AGENTS.some((builtin) => builtin.name === normalized)) throw new Error(`Agente builtin não pode ser removido: ${normalized}`)
  const custom = readCustomAgents()
  const remaining = custom.filter((agent) => agent.name !== normalized)
  if (BUILTIN_AGENTS.length + remaining.length < MIN_AGENTS) throw new Error(`DeepCode precisa manter no mínimo ${MIN_AGENTS} agentes.`)
  await writeCustomAgents(remaining)
  return custom.length !== remaining.length
}

export function formatAgentList(agents = listAgents()) {
  if (!agents.length) return 'Nenhum agente configurado.'
  return agents.map((agent) => {
    const model = agent.model ? `  model ${agent.model}` : '  model atual'
    return `${agent.name.padEnd(12)} ${agent.description}${model}`
  }).join('\n')
}

export function getAgent(name: string) {
  return listAgents().find((agent) => agent.name === name) ?? listAgents().find((agent) => agent.name === 'general')!
}
