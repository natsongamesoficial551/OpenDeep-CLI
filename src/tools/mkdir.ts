import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { z } from 'zod'
import { assertInsideRoot } from './pathGuard.js'
import { defineTool } from './tool.js'

export const mkdirTool = defineTool({
  id: 'mkdir',
  description: 'Create a directory inside the current project after permission approval.',
  parameters: z.object({ dirPath: z.string() }),
  async execute(args, ctx) {
    const dirPath = resolve(ctx.cwd, args.dirPath)
    assertInsideRoot(ctx.cwd, dirPath)
    const allowed = await ctx.permissions.require('write', `create directory ${args.dirPath}`, { pattern: args.dirPath })
    if (!allowed) throw new Error('Permission denied')
    await mkdir(dirPath, { recursive: true })
    return { title: args.dirPath, output: `Created directory ${args.dirPath}`, metadata: { dirPath } }
  },
})
