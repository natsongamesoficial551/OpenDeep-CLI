import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { OpenDeepConfig } from '../types.js'

export type PermissionCategory = 'read' | 'write' | 'shell' | 'network' | 'git' | 'secrets'

const DANGEROUS_COMMANDS = [
  /\brm\s+-rf\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+push\s+--force\b/i,
  /\bdel\s+\/s\b/i,
  /\brmdir\s+\/s\b/i,
  /\bformat\b/i,
]

export class PermissionManager {
  constructor(private readonly config: OpenDeepConfig) {}

  isDangerousShell(command: string) {
    return DANGEROUS_COMMANDS.some((pattern) => pattern.test(command))
  }

  async require(category: PermissionCategory, description: string, options: { command?: string } = {}) {
    if (this.config.permissions.autoAllow) return true
    if (category === 'read') return true
    if (category === 'network' && this.config.permissions.allowNetwork) return true
    if (category === 'shell' && this.config.permissions.allowShell && !this.isDangerousShell(options.command ?? '')) return true
    if (category === 'write' && this.config.permissions.allowWrite) return true

    const rl = readline.createInterface({ input, output })
    try {
      const answer = await rl.question(`Permitir ${category}: ${description}? [y/N] `)
      return /^y(es)?|s(im)?$/i.test(answer.trim())
    } finally {
      rl.close()
    }
  }
}
