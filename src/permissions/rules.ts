import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getConfigDirs } from '../config/paths.js'

export type PermissionAction = 'allow' | 'deny' | 'ask'
export type PermissionReply = 'once' | 'always' | 'reject'
export type PermissionCategory = 'read' | 'write' | 'edit' | 'shell' | 'network' | 'git' | 'secrets' | 'mcp'

export interface PermissionRule {
  permission: PermissionCategory | '*'
  pattern: string
  action: PermissionAction
}

async function permissionFile(projectId: string) {
  const dir = join(getConfigDirs().data, 'permissions')
  await mkdir(dir, { recursive: true })
  return join(dir, `${projectId}.json`)
}

function wildcardToRegExp(pattern: string) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp(`^${escaped}$`, 'i')
}

export function matchesPermissionRule(rule: PermissionRule, permission: PermissionCategory, pattern: string) {
  if (rule.permission !== '*' && rule.permission !== permission) return false
  return wildcardToRegExp(rule.pattern).test(pattern)
}

export function evaluatePermission(rules: PermissionRule[], permission: PermissionCategory, pattern: string): PermissionRule {
  return rules.find((rule) => matchesPermissionRule(rule, permission, pattern)) ?? { permission, pattern, action: 'ask' }
}

export async function loadPermissionRules(projectId: string): Promise<PermissionRule[]> {
  const file = await permissionFile(projectId)
  if (!existsSync(file)) return []
  return JSON.parse(await readFile(file, 'utf8')) as PermissionRule[]
}

export async function savePermissionRules(projectId: string, rules: PermissionRule[]) {
  await writeFile(await permissionFile(projectId), JSON.stringify(rules, null, 2))
}

export async function addPermissionRule(projectId: string, rule: PermissionRule) {
  const rules = await loadPermissionRules(projectId)
  const next = [rule, ...rules.filter((item) => item.permission !== rule.permission || item.pattern !== rule.pattern)]
  await savePermissionRules(projectId, next)
  return next
}

export function formatPermissionRules(rules: PermissionRule[]) {
  if (rules.length === 0) return 'Nenhuma regra configurada. O padrão é perguntar quando necessário.'
  return rules.map((rule) => `${rule.action.padEnd(5)} ${rule.permission.padEnd(8)} ${rule.pattern}`).join('\n')
}
