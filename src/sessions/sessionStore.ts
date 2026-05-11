import { existsSync } from 'node:fs'
import { appendFile, mkdir, readFile, writeFile, readdir, unlink } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { ChatMessage, ProjectRecord, SessionRecord } from '../types.js'
import { getConfigDirs } from '../config/paths.js'
import { AgentEvent, formatAgentEventJsonl } from '../core/agentEvents.js'

async function sessionsDir() {
  const dir = join(getConfigDirs().data, 'sessions')
  await mkdir(dir, { recursive: true })
  return dir
}

function sessionPath(dir: string, id: string) {
  return join(dir, `${id}.json`)
}

function sessionEventsPath(dir: string, id: string) {
  return join(dir, `${id}.events.jsonl`)
}

export async function appendSessionEvent(event: AgentEvent) {
  const dir = await sessionsDir()
  await appendFile(sessionEventsPath(dir, event.sessionId), formatAgentEventJsonl(event))
}

export async function loadSessionEvents(id: string) {
  const dir = await sessionsDir()
  const file = sessionEventsPath(dir, id)
  if (!existsSync(file)) return []
  const lines = (await readFile(file, 'utf8')).split('\n').filter(Boolean)
  return lines.map((line) => JSON.parse(line) as AgentEvent)
}

export function sessionTitleFromPrompt(prompt: string) {
  const title = prompt.trim().replace(/\s+/g, ' ').slice(0, 56)
  return title || 'Nova sessão'
}

export async function createSession(project: ProjectRecord, provider: string, model: string, agent = 'general') {
  const now = new Date().toISOString()
  const session: SessionRecord = {
    id: randomUUID(),
    title: 'Nova sessão',
    projectPath: project.path,
    provider,
    model,
    agent,
    messages: [],
    createdAt: now,
    updatedAt: now,
  }
  await saveSession(session)
  return session
}

export async function saveSession(session: SessionRecord) {
  session.updatedAt = new Date().toISOString()
  const dir = await sessionsDir()
  await writeFile(sessionPath(dir, session.id), JSON.stringify(session, null, 2))
}

export async function loadSession(id: string) {
  const dir = await sessionsDir()
  const file = sessionPath(dir, id)
  if (!existsSync(file)) return undefined
  return JSON.parse(await readFile(file, 'utf8')) as SessionRecord
}

export async function listSessions(projectPath?: string) {
  const dir = await sessionsDir()
  const files = await readdir(dir).catch(() => [])
  const sessions = await Promise.all(files.filter((file) => file.endsWith('.json')).map(async (file) => {
    try {
      return JSON.parse(await readFile(join(dir, file), 'utf8')) as SessionRecord
    } catch {
      return undefined
    }
  }))
  return sessions
    .filter((session): session is SessionRecord => Boolean(session))
    .filter((session) => projectPath ? session.projectPath === projectPath : true)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function deleteSession(id: string) {
  const dir = await sessionsDir()
  await unlink(sessionPath(dir, id))
}

export function appendMessage(session: SessionRecord, message: ChatMessage) {
  session.messages.push(message)
  if (session.title === 'Nova sessão' && message.role === 'user') session.title = sessionTitleFromPrompt(message.content)
}

function compact(value: string, max = 48) {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`
}

export function formatSessionList(sessions: SessionRecord[]) {
  if (sessions.length === 0) return 'Nenhuma sessão encontrada.'
  return sessions.map((session) => {
    const date = new Date(session.updatedAt).toLocaleString()
    return `${session.id.slice(0, 8)}  ${compact(session.title, 42).padEnd(42)}  ${compact(`${session.provider}/${session.model}`, 34).padEnd(34)}  ${compact(session.projectPath, 36)}  ${date}`
  }).join('\n')
}

export function projectNameFromPath(path: string) {
  return basename(path) || path
}
