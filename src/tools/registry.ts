import { ToolDefinition, ToolContext, ToolResult } from './tool.js'
import { readTool } from './read.js'
import { globToolDef } from './glob.js'
import { grepToolDef } from './grep.js'
import { editTool } from './edit.js'
import { writeTool } from './write.js'
import { bashToolDef } from './bash.js'
import { listTool } from './list.js'
import { mkdirTool } from './mkdir.js'
import { gitStatusTool, gitDiffTool, gitLogTool } from './git.js'
import { webFetchTool } from './webFetch.js'
import { runBackgroundTool, jobStatusTool, jobStopTool } from './localRunner.js'
import { browserCheckTool } from './browser.js'
import { truncateOutput } from '../core/truncation.js'
import { publish } from '../core/events.js'

export const BUILTIN_TOOLS = [readTool, listTool, globToolDef, grepToolDef, editTool, writeTool, mkdirTool, bashToolDef, runBackgroundTool, jobStatusTool, jobStopTool, gitStatusTool, gitDiffTool, gitLogTool, webFetchTool, browserCheckTool] satisfies ToolDefinition[]

export function listTools() {
  return BUILTIN_TOOLS.map((tool) => ({ id: tool.id, description: tool.description }))
}

export function formatToolList() {
  return listTools().map((tool) => `${tool.id.padEnd(14)} ${tool.description}`).join('\n')
}

export function getTool(id: string) {
  return BUILTIN_TOOLS.find((tool) => tool.id === id)
}

export async function runTool(id: string, args: unknown, ctx: ToolContext): Promise<ToolResult> {
  const tool = getTool(id)
  if (!tool) throw new Error(`Unknown tool: ${id}`)
  const parsed = tool.parameters.parse(args)
  publish({ type: 'tool.started', tool: id, title: id })
  const result = await (tool as ToolDefinition).execute(parsed, ctx)
  const truncated = await truncateOutput(result.output, { prefix: id })
  publish({ type: 'tool.completed', tool: id, title: result.title })
  return { ...result, output: truncated.content, metadata: { ...result.metadata, truncated: truncated.truncated, outputPath: truncated.outputPath } }
}
