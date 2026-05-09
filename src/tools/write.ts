import { mkdir, stat, writeFile } from 'node:fs/promises'
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
    const normalizedPath = args.filePath.trim()
    if (!normalizedPath) throw new Error('Tool write inválido: "filePath" não pode ser vazio.')

    const filePath = resolve(ctx.cwd, normalizedPath)
    assertInsideRoot(ctx.cwd, filePath)

    try {
      const info = await stat(filePath)
      if (info.isDirectory()) throw new Error('Tool write inválido: "filePath" aponta para um diretório.')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }

    const diff = createTwoFilesPatch(normalizedPath, normalizedPath, '', args.content)
    const allowed = await ctx.permissions.require('write', `write ${normalizedPath}`, { pattern: normalizedPath, metadata: { diff } })
    if (!allowed) throw new Error('Permission denied')
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, args.content)
    return { title: normalizedPath, output: `Wrote ${normalizedPath}`, metadata: { diff, filePath } }
  },
})
