import { z } from 'zod'
import { PermissionManager } from '../permissions/permissions.js'

export interface ToolContext {
  cwd: string
  sessionId: string
  agent: string
  permissions: PermissionManager
  signal?: AbortSignal | undefined
  metadata(input: { title?: string; metadata?: Record<string, unknown> }): Promise<void>
}

export interface ToolResult {
  title: string
  output: string
  metadata?: Record<string, unknown> | undefined
  attachments?: Array<{ path: string; mime?: string | undefined }> | undefined
}

export interface ToolDefinition<TSchema extends z.ZodType = z.ZodType> {
  id: string
  description: string
  parameters: TSchema
  execute(args: z.infer<TSchema>, ctx: ToolContext): Promise<ToolResult>
}

export function defineTool<TSchema extends z.ZodType>(definition: ToolDefinition<TSchema>) {
  return definition
}
