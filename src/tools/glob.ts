import fg from 'fast-glob'
import { z } from 'zod'
import { defineTool } from './tool.js'

export const globToolDef = defineTool({
  id: 'glob',
  description: 'Find files by glob pattern within the current project.',
  parameters: z.object({ pattern: z.string() }),
  async execute(args, ctx) {
    const files = await fg(args.pattern, { cwd: ctx.cwd, dot: true, onlyFiles: true, absolute: false, ignore: ['node_modules/**', 'dist/**', '.git/**'] })
    return { title: args.pattern, output: files.join('\n') || 'No files found.', metadata: { count: files.length } }
  },
})
