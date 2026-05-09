import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getConfigDirs } from '../config/paths.js'

export interface TruncationResult {
  content: string
  truncated: boolean
  outputPath?: string | undefined
}

function truncateUtf8(input: string, maxBytes: number) {
  const bytes = Buffer.from(input, 'utf8')
  if (bytes.length <= maxBytes) return input
  return bytes.subarray(0, maxBytes).toString('utf8').replace(/�$/u, '')
}

export async function truncateOutput(content: string, options: { maxBytes?: number; prefix?: string } = {}): Promise<TruncationResult> {
  const maxBytes = options.maxBytes ?? 48_000
  if (Buffer.byteLength(content, 'utf8') <= maxBytes) return { content, truncated: false }
  const dir = join(getConfigDirs().cache, 'tool-output')
  await mkdir(dir, { recursive: true })
  const outputPath = join(dir, `${options.prefix ?? 'output'}-${Date.now()}.txt`)
  await writeFile(outputPath, content)
  const suffix = `\n\n[Output truncado. Conteúdo completo salvo em: ${outputPath}]`
  const suffixBytes = Buffer.byteLength(suffix, 'utf8')
  const bodyLimit = Math.max(0, maxBytes - suffixBytes)
  return {
    content: `${truncateUtf8(content, bodyLimit)}${suffix}`,
    truncated: true,
    outputPath,
  }
}
