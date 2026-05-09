import chalk from 'chalk'
import stringWidth from 'string-width'
import wrapAnsi from 'wrap-ansi'
import stripAnsi from 'strip-ansi'

export function terminalWidth(max = 92) {
  return Math.max(48, Math.min(process.stdout.columns || 80, max))
}

function visibleSlice(input: string, width: number) {
  let out = ''
  let size = 0
  for (const char of stripAnsi(input)) {
    const next = stringWidth(char)
    if (size + next > width) break
    out += char
    size += next
  }
  return out
}

export function padVisible(input: string, width: number) {
  const size = stringWidth(stripAnsi(input))
  if (size > width) return visibleSlice(input, width)
  return input + ' '.repeat(width - size)
}

export function rule(title: string, width = terminalWidth()) {
  const clean = ` ${title} `
  const fill = Math.max(0, width - stringWidth(clean) - 2)
  return chalk.dim('╭─') + chalk.bold(clean) + chalk.dim('─'.repeat(fill) + '╮')
}

export function box(title: string, body: string, options: { width?: number; color?: (text: string) => string } = {}) {
  const width = options.width ?? terminalWidth()
  const color = options.color ?? ((text: string) => text)
  const inner = width - 4
  const header = color(rule(title, width))
  const lines = body.length === 0 ? [''] : wrapAnsi(body, inner, { hard: true, trim: false }).split('\n')
  const rendered = lines.map((line) => color(chalk.dim('│ ') + padVisible(line, inner) + chalk.dim(' │')))
  const footer = color(chalk.dim('╰' + '─'.repeat(width - 2) + '╯'))
  return [header, ...rendered, footer].join('\n')
}

export function table(rows: Array<[string, string]>, gap = 3) {
  const left = Math.max(...rows.map(([key]) => stringWidth(key)), 0)
  return rows.map(([key, value]) => `${chalk.cyan(padVisible(key, left))}${' '.repeat(gap)}${value}`).join('\n')
}

export function section(title: string, rows: string[]) {
  return [chalk.bold(title), ...rows.map((row) => `  ${row}`)].join('\n')
}
