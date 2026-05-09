import { spawn } from 'node:child_process'
import { z } from 'zod'
import { defineTool } from './tool.js'

async function git(args: string[], cwd: string) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], shell: false })
    let output = ''
    child.stdout.on('data', (chunk) => { output += chunk })
    child.stderr.on('data', (chunk) => { output += chunk })
    child.on('error', reject)
    child.on('close', (code) => code === 0 ? resolve(output || 'No output.') : reject(new Error(output || `git exited ${code}`)))
  })
}

export const gitStatusTool = defineTool({
  id: 'git_status',
  description: 'Show git status --short for the current project.',
  parameters: z.object({}),
  async execute(_args, ctx) {
    const output = await git(['status', '--short'], ctx.cwd)
    return { title: 'git status --short', output }
  },
})

export const gitDiffTool = defineTool({
  id: 'git_diff',
  description: 'Show git diff for the current project or a relative path.',
  parameters: z.object({ path: z.string().optional() }),
  async execute(args, ctx) {
    const gitArgs = args.path ? ['diff', '--', args.path] : ['diff']
    const output = await git(gitArgs, ctx.cwd)
    return { title: gitArgs.join(' '), output }
  },
})

export const gitLogTool = defineTool({
  id: 'git_log',
  description: 'Show recent git commits in one-line format.',
  parameters: z.object({ limit: z.number().int().positive().max(50).default(10) }),
  async execute(args, ctx) {
    const output = await git(['log', '--oneline', '-n', String(args.limit)], ctx.cwd)
    return { title: `git log --oneline -n ${args.limit}`, output }
  },
})
