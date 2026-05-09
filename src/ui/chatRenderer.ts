import chalk from 'chalk'
import { ChatRuntimeState, SlashCommand } from '../types.js'
import { box, table, terminalWidth } from './terminal.js'

export function renderHeader(state: ChatRuntimeState) {
  const body = table([
    ['provider', `${state.providerId} • ${state.model}`],
    ['agent', state.agent],
    ['project', state.project.name],
    ['session', `${state.session.title} (${state.session.id.slice(0, 8)})`],
    ['hint', 'digite / para comandos, /exit para sair'],
  ])
  console.log(box('OpenDeep', body, { color: chalk.cyan, width: terminalWidth() }))
}

export function renderUserBubble(text: string) {
  console.log('\n' + box('You', text, { color: chalk.green }))
}

export function renderAssistantStart() {
  const width = terminalWidth()
  console.log('\n' + chalk.blue('╭─') + chalk.bold.blue(' OpenDeep ') + chalk.blue('─'.repeat(Math.max(0, width - 13)) + '╮'))
  process.stdout.write(chalk.blue('│ '))
}

export function renderAssistantEnd() {
  const width = terminalWidth()
  process.stdout.write('\n')
  console.log(chalk.blue('╰' + '─'.repeat(width - 2) + '╯'))
}

export function renderAssistantBubble(text: string) {
  console.log('\n' + box('OpenDeep', text, { color: chalk.blue }))
}

export function renderNotice(title: string, text: string) {
  console.log('\n' + box(title, text, { color: chalk.yellow }))
}

export function renderError(text: string) {
  console.log('\n' + box('Erro', text, { color: chalk.red }))
}

export function renderCommandList(commands: SlashCommand[]) {
  const categories = [...new Set(commands.map((command) => command.category))]
  const body = categories.map((category) => {
    const rows = commands
      .filter((command) => command.category === category)
      .map((command) => `${chalk.cyan(command.usage.padEnd(24))} ${command.description}`)
      .join('\n')
    return `${chalk.bold(category)}\n${rows}`
  }).join('\n\n')
  console.log('\n' + box('Comandos /', body, { color: chalk.magenta }))
}
