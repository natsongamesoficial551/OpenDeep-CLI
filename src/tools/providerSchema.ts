import { z } from 'zod'
import { ToolSpec } from '../types.js'
import { ToolDefinition } from './tool.js'

function sanitizeToolName(name: string) {
  return name.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64)
}

export function toolToSpec(tool: ToolDefinition): ToolSpec {
  return {
    name: sanitizeToolName(tool.id),
    description: tool.description,
    inputSchema: z.toJSONSchema(tool.parameters) as Record<string, unknown>,
  }
}

export function toolsToSpecs(tools: ToolDefinition[]): ToolSpec[] {
  return tools.map(toolToSpec)
}
