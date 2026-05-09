import envPaths from 'env-paths'

export function getConfigDirs() {
  return envPaths('opendeep', { suffix: '' })
}
