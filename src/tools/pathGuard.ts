import { resolve } from 'node:path'

export function isInsideRoot(root: string, target: string) {
  const resolvedRoot = resolve(root)
  const resolvedTarget = resolve(target)
  return resolvedTarget === resolvedRoot || resolvedTarget.startsWith(`${resolvedRoot}\\`) || resolvedTarget.startsWith(`${resolvedRoot}/`)
}

export function assertInsideRoot(root: string, target: string) {
  if (!isInsideRoot(root, target)) throw new Error(`Path is outside project root: ${target}`)
}
