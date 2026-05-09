import { SlashCommand } from '../types.js'

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: 'help', aliases: ['?'], usage: '/help', description: 'Mostra todos os comandos com explicação.', category: 'Core', template: '/help' },
  { name: 'exit', aliases: ['quit'], usage: '/exit', description: 'Fecha o OpenDeep.', category: 'Core', template: '/exit' },
  { name: 'clear', usage: '/clear', description: 'Limpa o contexto da sessão atual.', category: 'Core', template: '/clear' },
  { name: 'doctor', usage: '/doctor', description: 'Roda diagnóstico de ambiente/configuração.', category: 'Core', template: '/doctor' },
  { name: 'provider', usage: '/provider [id]', description: 'Mostra ou troca o provedor atual.', category: 'Provider', template: '/provider ' },
  { name: 'providers', usage: '/providers', description: 'Lista provedores disponíveis.', category: 'Provider', template: '/providers' },
  { name: 'login', aliases: ['setup'], usage: '/login <provider>', description: 'Alias de /api para logar/configurar provider.', category: 'Provider', template: '/login ' },
  { name: 'api', usage: '/api <provider>', description: 'Configura API key com armazenamento seguro.', category: 'Provider', template: '/api ' },
  { name: 'model', usage: '/model [provider/model]', description: 'Mostra ou troca modelo.', category: 'Model', template: '/model ' },
  { name: 'models', usage: '/models [provider]', description: 'Lista modelos recomendados.', category: 'Model', template: '/models ' },
  { name: 'use', usage: '/use <provider|provider/model>', description: 'Troca provider/model em um passo.', category: 'Model', template: '/use ' },
  { name: 'agent', usage: '/agent [name]', description: 'Mostra ou troca o agente da sessão.', category: 'Agent', template: '/agent ' },
  { name: 'agents', usage: '/agents', description: 'Lista agentes disponíveis.', category: 'Agent', template: '/agents' },
  { name: 'project', usage: '/project [add <path>]', description: 'Mostra ou registra projeto.', category: 'Project', template: '/project ' },
  { name: 'projects', usage: '/projects', description: 'Lista projetos recentes.', category: 'Project', template: '/projects' },
  { name: 'new', usage: '/new', description: 'Cria uma nova sessão.', category: 'Session', template: '/new' },
  { name: 'sessions', usage: '/sessions', description: 'Lista sessões recentes.', category: 'Session', template: '/sessions' },
  { name: 'session', usage: '/session <id>', description: 'Carrega sessão pelo prefixo/id.', category: 'Session', template: '/session ' },
  { name: 'rename', usage: '/rename <title>', description: 'Renomeia a sessão atual.', category: 'Session', template: '/rename ' },
  { name: 'config', usage: '/config', description: 'Mostra configuração com secrets redigidos.', category: 'Config', template: '/config' },
  { name: 'tools', usage: '/tools', description: 'Lista ferramentas locais disponíveis.', category: 'Tools', template: '/tools' },
  { name: 'permissions', usage: '/permissions', description: 'Lista regras de permissão do projeto.', category: 'Permissions', template: '/permissions' },
  { name: 'allow', usage: '/allow <permission> <pattern>', description: 'Adiciona regra allow para o projeto.', category: 'Permissions', template: '/allow shell ' },
  { name: 'deny', usage: '/deny <permission> <pattern>', description: 'Adiciona regra deny para o projeto.', category: 'Permissions', template: '/deny shell ' },
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

export function searchSlashCommands(query: string) {
  const term = query.trim().toLowerCase()
  if (!term) return SLASH_COMMANDS
  return SLASH_COMMANDS.filter((command) => {
    const aliases = command.aliases?.some((alias) => alias.toLowerCase().includes(term)) ?? false
    return command.name.toLowerCase().includes(term)
      || command.usage.toLowerCase().includes(term)
      || command.description.toLowerCase().includes(term)
      || aliases
  })
}
