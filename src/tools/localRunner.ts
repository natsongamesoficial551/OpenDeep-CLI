import { spawn, ChildProcessByStdio } from 'node:child_process'
import { Readable } from 'node:stream'
import { z } from 'zod'
import { defineTool } from './tool.js'

const MAX_LOG_LINES = 200
const jobs = new Map<string, LocalJob>()
let nextJobId = 1

type LocalJob = {
  id: string
  command: string
  cwd: string
  child: ChildProcessByStdio<null, Readable, Readable>
  logs: string[]
  startedAt: string
  exitCode?: number | null
  signal?: NodeJS.Signals | null
}

function pushLog(job: LocalJob, chunk: Buffer | string) {
  const text = chunk.toString()
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue
    job.logs.push(line)
  }
  if (job.logs.length > MAX_LOG_LINES) job.logs.splice(0, job.logs.length - MAX_LOG_LINES)
}

function jobSummary(job: LocalJob) {
  const running = job.exitCode === undefined
  const lines = [
    `jobId: ${job.id}`,
    `command: ${job.command}`,
    `pid: ${job.child.pid ?? 'unknown'}`,
    `status: ${running ? 'running' : 'exited'}`,
    `startedAt: ${job.startedAt}`,
  ]
  if (!running) lines.push(`exitCode: ${job.exitCode}`, `signal: ${job.signal ?? 'none'}`)
  lines.push('', 'logs:', job.logs.length ? job.logs.slice(-80).join('\n') : '(no logs yet)')
  return lines.join('\n')
}

export const runBackgroundTool = defineTool({
  id: 'run_background',
  description: 'Start a long-running local command in the project directory and capture logs.',
  parameters: z.object({ command: z.string(), label: z.string().optional() }),
  async execute(args, ctx) {
    const allowed = await ctx.permissions.require('shell', args.command, { command: args.command, pattern: args.command })
    if (!allowed) throw new Error('Permission denied')

    const id = `job-${nextJobId++}`
    const child = spawn(args.command, { shell: true, cwd: ctx.cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    const job: LocalJob = { id, command: args.command, cwd: ctx.cwd, child, logs: [], startedAt: new Date().toISOString() }
    jobs.set(id, job)
    child.stdout.on('data', (chunk) => pushLog(job, chunk))
    child.stderr.on('data', (chunk) => pushLog(job, chunk))
    child.on('error', (error) => pushLog(job, `process error: ${error.message}`))
    child.on('close', (code, signal) => {
      job.exitCode = code
      job.signal = signal
    })

    return { title: args.label ?? args.command, output: jobSummary(job), metadata: { jobId: id, pid: child.pid, running: true } }
  },
})

export const jobStatusTool = defineTool({
  id: 'job_status',
  description: 'Show status and recent logs for a background job.',
  parameters: z.object({ jobId: z.string() }),
  async execute(args) {
    const job = jobs.get(args.jobId)
    if (!job) throw new Error(`Unknown job: ${args.jobId}`)
    return { title: args.jobId, output: jobSummary(job), metadata: { jobId: job.id, running: job.exitCode === undefined, exitCode: job.exitCode } }
  },
})

export const jobStopTool = defineTool({
  id: 'job_stop',
  description: 'Stop a background job started by run_background.',
  parameters: z.object({ jobId: z.string(), signal: z.enum(['SIGTERM', 'SIGKILL']).default('SIGTERM') }),
  async execute(args) {
    const job = jobs.get(args.jobId)
    if (!job) throw new Error(`Unknown job: ${args.jobId}`)
    if (job.exitCode !== undefined) return { title: args.jobId, output: jobSummary(job), metadata: { jobId: job.id, running: false, exitCode: job.exitCode } }
    job.child.kill(args.signal)
    return { title: args.jobId, output: `Stop signal sent: ${args.signal}\n\n${jobSummary(job)}`, metadata: { jobId: job.id, running: false } }
  },
})

export function clearJobsForTests() {
  for (const job of jobs.values()) {
    if (job.exitCode === undefined) {
      job.child.kill('SIGKILL')
      job.child.unref()
    }
  }
  jobs.clear()
  nextJobId = 1
}
