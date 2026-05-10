import chalk from 'chalk'
import { padVisible, terminalWidth } from './terminal.js'

type ToolArgs = Record<string, unknown>

export type TaskStatus = 'pending' | 'running' | 'done' | 'error' | 'cancelled'

export interface TaskLine {
  label: string
  toolName: string
  status: TaskStatus
  durationMs?: number | undefined
  providerId?: string | undefined
  model?: string | undefined
  taskIndex?: number | undefined
}

function asObject(value: unknown): ToolArgs {
  return value && typeof value === 'object' ? value as ToolArgs : {}
}

function firstString(args: ToolArgs, names: string[]) {
  for (const name of names) {
    const value = args[name]
    if (typeof value === 'string' && value.trim()) return value
  }
  return undefined
}

export function truncateText(value: string, max = 72) {
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1))}…`
}

export function formatToolLabel(toolName: string, rawArgs: unknown) {
  const args = asObject(rawArgs)
  const path = firstString(args, ['path', 'filePath', 'target', 'directory'])
  switch (toolName) {
    case 'read': return `Lendo ${path ?? 'arquivo'}`
    case 'write': return `Escrevendo ${path ?? 'arquivo'}`
    case 'edit': return `Editando ${path ?? 'arquivo'}`
    case 'mkdir': return `Criando diretório ${path ?? ''}`.trim()
    case 'list': return `Explorando ${path ?? '.'}`
    case 'glob': return `Listando ${firstString(args, ['pattern']) ?? 'arquivos'}`
    case 'grep': return `Buscando ${firstString(args, ['pattern', 'query']) ?? 'texto'}`
    case 'bash': return `Executando ${truncateText(firstString(args, ['command']) ?? 'comando', 80)}`
    case 'web_fetch': return `Acessando ${firstString(args, ['url']) ?? 'web'}`
    case 'browser_check': return `Verificando página ${firstString(args, ['url']) ?? ''}`.trim()
    case 'git_status': return 'Verificando git status'
    default: return `${toolName} ${path ?? ''}`.trim()
  }
}

function formatDuration(durationMs?: number) {
  if (durationMs === undefined) return '...'
  if (durationMs < 1000) return `${durationMs}ms`
  return `${(durationMs / 1000).toFixed(1)}s`
}

function statusIcon(status: TaskStatus) {
  switch (status) {
    case 'pending': return chalk.dim('○')
    case 'running': return chalk.cyan('⠹')
    case 'done': return chalk.green('✓')
    case 'error': return chalk.red('✗')
    case 'cancelled': return chalk.yellow('⊘')
  }
}

export function renderTaskLine(task: TaskLine, width = terminalWidth()) {
  const duration = formatDuration(task.durationMs)
  const tool = chalk.dim(task.toolName)
  const modelTag = task.providerId && task.model ? `${task.providerId}/${task.model}` : ''
  const suffix = [tool, chalk.dim(duration), modelTag ? chalk.dim(modelTag) : ''].filter(Boolean).join('  ')
  const index = task.taskIndex !== undefined ? `[${task.taskIndex}] ` : ''
  const labelBudget = Math.max(12, width - 4 - suffix.replace(/\u001b\[[0-9;]*m/g, '').length)
  const plainLabel = truncateText(`${index}${task.label}`, labelBudget)
  return `${statusIcon(task.status)} ${padVisible(plainLabel, labelBudget)} ${suffix}`
}

type TaskRenderContext = {
  providerId?: string | undefined
  model?: string | undefined
  taskIndex?: number | undefined
}

export function renderTaskStart(toolName: string, args: unknown, context: TaskRenderContext = {}) {
  const label = formatToolLabel(toolName, args)
  console.log(`\n${renderTaskLine({ label, toolName, status: 'running', ...context })}`)
  return { label, startedAt: Date.now(), context }
}

export function renderTaskFinish(toolName: string, label: string, startedAt: number, status: Exclude<TaskStatus, 'pending' | 'running'> = 'done', context: TaskRenderContext = {}) {
  console.log(renderTaskLine({ label, toolName, status, durationMs: Date.now() - startedAt, ...context }))
}
