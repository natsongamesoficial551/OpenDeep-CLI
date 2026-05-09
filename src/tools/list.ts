import { readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { z } from 'zod'
import { assertInsideRoot } from './pathGuard.js'
import { defineTool } from './tool.js'

export const listTool = defineTool({
  id: 'list',
  description: 'List files and directories inside a project directory without exposing absolute paths.',
  parameters: z.object({ dirPath: z.string().default('.') }),
  async execute(args, ctx) {
    const dirPath = resolve(ctx.cwd, args.dirPath)
    assertInsideRoot(ctx.cwd, dirPath)
    const entries = await readdir(dirPath, { withFileTypes: true })
    const output = entries
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((entry) => `${entry.isDirectory() ? 'dir ' : 'file'}  ${entry.name}`)
      .join('\n') || 'No entries found.'
    return { title: args.dirPath, output, metadata: { count: entries.length } }
  },
})
