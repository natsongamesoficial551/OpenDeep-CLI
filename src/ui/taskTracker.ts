import chalk from 'chalk'
import { padVisible, terminalWidth } from './terminal.js'

type ToolArgs = Record<string, unknown>

export type TaskStatus = 'pending' | 'running' | 'done' | 'error' | 'cancelled'

export interface TaskLine {
  label: string
  toolName: string
  status: TaskStatus
  durationMs?: number | undefined
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
  const labelWidth = Math.max(12, width - 22)
  const plainLabel = truncateText(task.label, labelWidth)
  return `${statusIcon(task.status)} ${padVisible(plainLabel, labelWidth)} ${tool.padEnd(10)} ${chalk.dim(duration)}`
}

export function renderTaskStart(toolName: string, args: unknown) {
  const label = formatToolLabel(toolName, args)
  console.log(`\n${renderTaskLine({ label, toolName, status: 'running' })}`)
  return { label, startedAt: Date.now() }
}

export function renderTaskFinish(toolName: string, label: string, startedAt: number, status: Exclude<TaskStatus, 'pending' | 'running'> = 'done') {
  console.log(renderTaskLine({ label, toolName, status, durationMs: Date.now() - startedAt }))
}
