import { SlashCommand } from '../types.js'

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: 'help', aliases: ['?'], usage: '/help', description: 'Mostra todos os comandos com explicação.', category: 'Core' },
  { name: 'exit', aliases: ['quit'], usage: '/exit', description: 'Fecha o OpenDeep.', category: 'Core' },
  { name: 'clear', usage: '/clear', description: 'Limpa o contexto da sessão atual.', category: 'Core' },
  { name: 'doctor', usage: '/doctor', description: 'Roda diagnóstico de ambiente/configuração.', category: 'Core' },
  { name: 'provider', usage: '/provider [id]', description: 'Mostra ou troca o provedor atual.', category: 'Provider' },
  { name: 'providers', usage: '/providers', description: 'Lista provedores disponíveis.', category: 'Provider' },
  { name: 'login', aliases: ['setup'], usage: '/login <provider>', description: 'Alias de /api para logar/configurar provider.', category: 'Provider' },
  { name: 'api', usage: '/api <provider>', description: 'Configura API key com armazenamento seguro.', category: 'Provider' },
  { name: 'model', usage: '/model [provider/model]', description: 'Mostra ou troca modelo.', category: 'Model' },
  { name: 'models', usage: '/models [provider]', description: 'Lista modelos recomendados.', category: 'Model' },
  { name: 'agent', usage: '/agent [name]', description: 'Mostra ou troca o agente da sessão.', category: 'Agent' },
  { name: 'agents', usage: '/agents', description: 'Lista agentes disponíveis.', category: 'Agent' },
  { name: 'project', usage: '/project [add <path>]', description: 'Mostra ou registra projeto.', category: 'Project' },
  { name: 'projects', usage: '/projects', description: 'Lista projetos recentes.', category: 'Project' },
  { name: 'new', usage: '/new', description: 'Cria uma nova sessão.', category: 'Session' },
  { name: 'sessions', usage: '/sessions', description: 'Lista sessões recentes.', category: 'Session' },
  { name: 'session', usage: '/session <id>', description: 'Carrega sessão pelo prefixo/id.', category: 'Session' },
  { name: 'rename', usage: '/rename <title>', description: 'Renomeia a sessão atual.', category: 'Session' },
  { name: 'config', usage: '/config', description: 'Mostra configuração com secrets redigidos.', category: 'Config' },
  { name: 'tools', usage: '/tools', description: 'Lista ferramentas locais disponíveis.', category: 'Tools' },
  { name: 'permissions', usage: '/permissions', description: 'Lista regras de permissão do projeto.', category: 'Permissions' },
  { name: 'allow', usage: '/allow <permission> <pattern>', description: 'Adiciona regra allow para o projeto.', category: 'Permissions' },
  { name: 'deny', usage: '/deny <permission> <pattern>', description: 'Adiciona regra deny para o projeto.', category: 'Permissions' },
]

export function resolveSlash(input: string) {
  if (input.trim() === '/') return { command: 'help', args: '' }
  const match = input.trim().match(/^\/(\S+)(?:\s+(.*))?$/)
  if (!match) return undefined
  const name = match[1] ?? ''
  const args = match[2] ?? ''
  const found = SLASH_COMMANDS.find((command) => command.name === name || command.aliases?.includes(name))
  if (!found) return { command: name, args, unknown: true }
  return { command: found.name, args, unknown: false }
}
