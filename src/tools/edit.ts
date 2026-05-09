import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createTwoFilesPatch } from 'diff'
import { z } from 'zod'
import { assertInsideRoot } from './pathGuard.js'
import { defineTool } from './tool.js'

function detectLineEnding(text: string) {
  return text.includes('\r\n') ? '\r\n' : '\n'
}

function normalizeLineEndings(text: string) {
  return text.replaceAll('\r\n', '\n')
}

function convertLineEndings(text: string, ending: string) {
  return ending === '\r\n' ? text.replaceAll('\n', '\r\n') : text
}

function replaceText(content: string, oldString: string, newString: string, replaceAll = false) {
  if (oldString === '') return newString
  const count = content.split(oldString).length - 1
  if (count === 0) throw new Error('oldString not found in file')
  if (count > 1 && !replaceAll) throw new Error('oldString is not unique; use replaceAll to replace every match')
  return replaceAll ? content.split(oldString).join(newString) : content.replace(oldString, newString)
}

export const editTool = defineTool({
  id: 'edit',
  description: 'Edit a file by replacing exact text, showing a diff before writing.',
  parameters: z.object({ filePath: z.string(), oldString: z.string(), newString: z.string(), replaceAll: z.boolean().default(false) }),
  async execute(args, ctx) {
    if (args.oldString === args.newString) throw new Error('oldString and newString are identical')
    const filePath = resolve(ctx.cwd, args.filePath)
    assertInsideRoot(ctx.cwd, filePath)
    const oldContent = existsSync(filePath) ? await readFile(filePath, 'utf8') : ''
    const ending = detectLineEnding(oldContent)
    const oldString = convertLineEndings(normalizeLineEndings(args.oldString), ending)
    const newString = convertLineEndings(normalizeLineEndings(args.newString), ending)
    const newContent = replaceText(oldContent, oldString, newString, args.replaceAll)
    const diff = createTwoFilesPatch(args.filePath, args.filePath, oldContent, newContent)
    const allowed = await ctx.permissions.require('edit', `edit ${args.filePath}`, { pattern: args.filePath, metadata: { diff } })
    if (!allowed) throw new Error('Permission denied')
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, newContent)
    return { title: args.filePath, output: 'Edit applied successfully.', metadata: { diff, filePath } }
  },
})
