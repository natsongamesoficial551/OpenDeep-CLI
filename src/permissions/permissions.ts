import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { OpenDeepConfig } from '../types.js'
import { addPermissionRule, evaluatePermission, loadPermissionRules, PermissionCategory } from './rules.js'

const DANGEROUS_COMMANDS = [
  /\brm\s+-[a-z]*r[a-z]*f[a-z]*\b/i,
  /\brm\s+-[a-z]*f[a-z]*r[a-z]*\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+push\s+--force(?:\b|=|-)/i,
  /\bdel\s+\/s\b/i,
  /\brmdir\s+\/s\b/i,
  /\bformat\b/i,
  /\bmkfs(?:\.|\s)/i,
  /\bshutdown\b/i,
]

export class PermissionManager {
  constructor(private readonly config: OpenDeepConfig, private readonly projectId = 'global') {}

  isDangerousShell(command: string) {
    return DANGEROUS_COMMANDS.some((pattern) => pattern.test(command))
  }

  canAutoAllow(category: PermissionCategory, description: string, options: { command?: string } = {}) {
    if (this.config.permissions.allowAll) return true
    return !(category === 'shell' && this.isDangerousShell(options.command ?? description))
  }

  async require(category: PermissionCategory, description: string, options: { command?: string; pattern?: string; metadata?: Record<string, unknown> } = {}) {
    if (this.config.permissions.allowAll) return true
    const dangerousShell = category === 'shell' && !this.canAutoAllow(category, description, options)
    if (this.config.permissions.autoAllow && !dangerousShell) return true
    if (category === 'read') return true

    const pattern = options.pattern ?? options.command ?? description
    const rules = await loadPermissionRules(this.projectId)
    const rule = evaluatePermission(rules, category, pattern)
    if (rule.action === 'allow' && !dangerousShell) return true
    if (rule.action === 'deny') return false

    if (category === 'network' && this.config.permissions.allowNetwork) return true
    if (category === 'shell' && this.config.permissions.allowShell && !dangerousShell) return true
    if ((category === 'write' || category === 'edit') && this.config.permissions.allowWrite) return true

    const rl = readline.createInterface({ input, output })
    try {
      const metadata = options.metadata ? `\n${JSON.stringify(options.metadata, null, 2)}\n` : ''
      const danger = dangerousShell ? '\nComando potencialmente destrutivo detectado; auto-allow e regras allow não se aplicam.\n' : ''
      const answer = await rl.question(`Permitir ${category}: ${description}?${danger}${metadata}\n[y] once / [a] always / [n] reject: `)
      if (/^a(lways)?|s(empre)?$/i.test(answer.trim()) && !dangerousShell) {
        await addPermissionRule(this.projectId, { permission: category, pattern, action: 'allow' })
        return true
      }
      return /^y(es)?|s(im)?$/i.test(answer.trim())
    } finally {
      rl.close()
    }
  }
}

export { PermissionCategory } from './rules.js'
