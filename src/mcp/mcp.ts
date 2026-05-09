export interface McpServerConfig {
  name: string
  command: string
  args?: string[]
  env?: Record<string, string>
}

export function validateMcpServer(server: McpServerConfig) {
  if (!server.name.trim()) throw new Error('MCP server name cannot be empty')
  if (!server.command.trim()) throw new Error('MCP server command cannot be empty')
  return server
}
