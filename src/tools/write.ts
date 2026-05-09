import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { createTwoFilesPatch } from 'diff'
import { z } from 'zod'
import { assertInsideRoot } from './pathGuard.js'
import { defineTool } from './tool.js'

export const writeTool = defineTool({
  id: 'write',
  description: 'Write a UTF-8 text file after permission approval.',
  parameters: z.object({ filePath: z.string(), content: z.string() }),
  async execute(args, ctx) {
    const filePath = resolve(ctx.cwd, args.filePath)
    assertInsideRoot(ctx.cwd, filePath)
    const diff = createTwoFilesPatch(args.filePath, args.filePath, '', args.content)
    const allowed = await ctx.permissions.require('write', `write ${args.filePath}`, { pattern: args.filePath, metadata: { diff } })
    if (!allowed) throw new Error('Permission denied')
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, args.content)
    return { title: args.filePath, output: `Wrote ${args.filePath}`, metadata: { diff, filePath } }
  },
})
