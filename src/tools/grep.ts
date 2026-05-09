import { readFile } from 'node:fs/promises'
import fg from 'fast-glob'
import { join } from 'node:path'
import { z } from 'zod'
import { defineTool } from './tool.js'

export const grepToolDef = defineTool({
  id: 'grep',
  description: 'Search file contents using a JavaScript regular expression.',
  parameters: z.object({ pattern: z.string(), glob: z.string().default('**/*') }),
  async execute(args, ctx) {
    const regex = new RegExp(args.pattern, 'i')
    const files = await fg(args.glob, { cwd: ctx.cwd, dot: true, onlyFiles: true, absolute: false, ignore: ['node_modules/**', 'dist/**', '.git/**'] })
    const results: string[] = []
    for (const file of files.slice(0, 500)) {
      const content = await readFile(join(ctx.cwd, file), 'utf8').catch(() => '')
      content.split(/\r?\n/).forEach((line, index) => {
        if (regex.test(line)) results.push(`${file}:${index + 1}: ${line}`)
      })
    }
    return { title: args.pattern, output: results.join('\n') || 'No matches found.', metadata: { count: results.length } }
  },
})
