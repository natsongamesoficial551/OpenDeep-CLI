import { spawn } from 'node:child_process'
import { z } from 'zod'
import { truncateOutput } from '../core/truncation.js'
import { defineTool } from './tool.js'

export const bashToolDef = defineTool({
  id: 'bash',
  description: 'Run a shell command with permission checks and output truncation.',
  parameters: z.object({ command: z.string(), timeoutMs: z.number().int().positive().max(600_000).default(120_000) }),
  async execute(args, ctx) {
    const allowed = await ctx.permissions.require('shell', args.command, { command: args.command, pattern: args.command })
    if (!allowed) throw new Error('Permission denied')
    const output = await new Promise<string>((resolve, reject) => {
      const child = spawn(args.command, { shell: true, cwd: ctx.cwd, stdio: ['ignore', 'pipe', 'pipe'] })
      const timer = setTimeout(() => {
        child.kill()
        reject(new Error(`Command timed out after ${args.timeoutMs}ms`))
      }, args.timeoutMs)
      let data = ''
      child.stdout.on('data', (chunk) => { data += chunk })
      child.stderr.on('data', (chunk) => { data += chunk })
      child.on('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      child.on('close', (code) => {
        clearTimeout(timer)
        code === 0 ? resolve(data || 'Done.') : reject(new Error(data || `Command exited ${code}`))
      })
    })
    const truncated = await truncateOutput(output, { prefix: 'bash' })
    return { title: args.command, output: truncated.content, metadata: { truncated: truncated.truncated, outputPath: truncated.outputPath } }
  },
})
