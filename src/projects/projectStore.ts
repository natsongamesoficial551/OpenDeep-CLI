import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { getConfigDirs } from '../config/paths.js'
import { ProjectRecord } from '../types.js'

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

export async function upsertProject(path = process.cwd(), lastSessionId?: string) {
  const resolved = resolve(path)
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
