import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { getConfigDirs } from '../config/paths.js'
import { OpenDeepConfig, ProjectRecord } from '../types.js'

async function projectsFile() {
  const dir = getConfigDirs().data
  await mkdir(dir, { recursive: true })
  return `${dir}/projects.json`
}

function projectId(path: string) {
  return createHash('sha1').update(resolve(path)).digest('hex').slice(0, 12)
}

async function readProjects() {
  const file = await projectsFile()
  if (!existsSync(file)) return [] as ProjectRecord[]
  return JSON.parse(await readFile(file, 'utf8')) as ProjectRecord[]
}

async function writeProjects(projects: ProjectRecord[]) {
  await writeFile(await projectsFile(), JSON.stringify(projects, null, 2))
}

export function defaultProjectsRoot(config?: OpenDeepConfig) {
  const configured = config?.workspace?.projectsDir?.trim()
  return resolve(configured || join(process.cwd(), 'projects'))
}

export function projectSlug(input: string) {
  const slug = input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
  return slug || `project-${new Date().toISOString().slice(0, 10)}`
}

const CREATE_PROJECT_RE = /\b(cri(e|ar|a)|criar|crie|ger(e|ar)|gerar|fa(ç|c)a|fazer|create|build|generate)\b[\s\S]{0,80}\b(projeto|project|app|aplicativo|site|saas|sistema|dashboard|cli|api)\b/i

export function projectCreationTargetFromPrompt(prompt: string) {
  if (!CREATE_PROJECT_RE.test(prompt)) return undefined
  const explicitPath = prompt.match(/\b(?:em|no diret[oó]rio|na pasta|path|pasta)\s+([A-Za-z]:[\\/][^\n]+|\/[^\n]+)$/i)?.[1]?.trim()
  const cleaned = prompt
    .replace(/\b(?:em|no diret[oó]rio|na pasta|path|pasta)\s+([A-Za-z]:[\\/][^\n]+|\/[^\n]+)$/i, '')
    .replace(/^\s*(crie|criar|cria|gere|gerar|faça|fazer|create|build|generate)\s+/i, '')
  return { name: projectSlug(cleaned), explicitPath }
}

export async function createWorkspaceProject(promptOrName: string, config?: OpenDeepConfig, explicitPath?: string) {
  const target = projectCreationTargetFromPrompt(promptOrName)
  const name = projectSlug(target?.name ?? promptOrName)
  const root = explicitPath ?? target?.explicitPath
  const path = root ? resolve(root) : join(defaultProjectsRoot(config), name)
  await mkdir(path, { recursive: true })
  return upsertProject(path)
}

export async function upsertProject(path = process.cwd(), lastSessionId?: string) {
  const resolved = resolve(path)
  await mkdir(resolved, { recursive: true })
  const projects = await readProjects()
  const id = projectId(resolved)
  const existing = projects.find((project) => project.id === id)
  const next: ProjectRecord = {
    id,
    name: basename(resolved) || resolved,
    path: resolved,
    lastSessionId: lastSessionId ?? existing?.lastSessionId,
    updatedAt: new Date().toISOString(),
  }
  await writeProjects([next, ...projects.filter((project) => project.id !== id)].slice(0, 100))
  return next
}

export async function setProjectSession(project: ProjectRecord, sessionId: string) {
  return upsertProject(project.path, sessionId)
}

export async function listProjects() {
  return (await readProjects()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function formatProjectList(projects: ProjectRecord[]) {
  if (projects.length === 0) return 'Nenhum projeto registrado.'
  return projects.map((project) => `${project.id}  ${project.name}  ${project.path}`).join('\n')
}
