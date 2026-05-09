import { readFile, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import fg from 'fast-glob'
import { PermissionManager } from '../permissions/permissions.js'

export async function readFileTool(path: string) {
  return readFile(path, 'utf8')
}

export async function writeFileTool(path: string, content: string, permissions: PermissionManager) {
  if (!await permissions.require('write', `write ${path}`)) throw new Error('Permission denied')
  await writeFile(path, content)
  return `Wrote ${path}`
}

export async function globTool(pattern: string, cwd = process.cwd()) {
  return fg(pattern, { cwd, dot: true, onlyFiles: true, absolute: false })
}

export async function grepTool(pattern: string, files: string[], cwd = process.cwd()) {
  const regex = new RegExp(pattern, 'i')
  const results: Array<{ file: string; line: number; text: string }> = []
  for (const file of files) {
    const content = await readFile(`${cwd}/${file}`, 'utf8').catch(() => '')
    content.split(/\r?\n/).forEach((line, index) => {
      if (regex.test(line)) results.push({ file, line: index + 1, text: line })
    })
  }
  return results
}

export async function bashTool(command: string, permissions: PermissionManager) {
  if (!await permissions.require('shell', command, { command })) throw new Error('Permission denied')
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, { shell: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', (chunk) => { output += chunk })
    child.stderr.on('data', (chunk) => { output += chunk })
    child.on('error', reject)
    child.on('close', (code) => code === 0 ? resolve(output) : reject(new Error(output || `Command exited ${code}`)))
  })
}

export async function gitStatusTool(permissions: PermissionManager) {
  if (!await permissions.require('git', 'git status')) throw new Error('Permission denied')
  return bashTool('git status --short', permissions)
}

export async function webFetchTool(url: string, permissions: PermissionManager) {
  if (!await permissions.require('network', `fetch ${url}`)) throw new Error('Permission denied')
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.text()
}
