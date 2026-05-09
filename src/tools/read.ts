import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { z } from 'zod'
import { assertInsideRoot } from './pathGuard.js'
import { defineTool } from './tool.js'

export const readTool = defineTool({
  id: 'read',
  description: 'Read a UTF-8 text file from the current project.',
  parameters: z.object({ filePath: z.string() }),
  async execute(args, ctx) {
    const filePath = resolve(ctx.cwd, args.filePath)
    assertInsideRoot(ctx.cwd, filePath)
    const output = await readFile(filePath, 'utf8')
    return { title: args.filePath, output, metadata: { filePath } }
  },
})
