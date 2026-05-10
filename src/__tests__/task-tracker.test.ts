import test from 'node:test'
import assert from 'node:assert/strict'
import { formatToolLabel, renderTaskLine } from '../ui/taskTracker.js'

test('formats friendly labels for common tool calls', () => {
  assert.equal(formatToolLabel('read', { path: 'src/index.ts' }), 'Lendo src/index.ts')
  assert.equal(formatToolLabel('write', { filePath: 'src/app.ts' }), 'Escrevendo src/app.ts')
  assert.equal(formatToolLabel('bash', { command: 'npm test -- --runInBand' }), 'Executando npm test -- --runInBand')
  assert.equal(formatToolLabel('grep', { pattern: 'allowAll' }), 'Buscando allowAll')
})

test('renders task line status with duration', () => {
  assert.match(renderTaskLine({ label: 'Lendo src/index.ts', toolName: 'read', status: 'done', durationMs: 1234 }), /✓ Lendo src\/index\.ts\s+read\s+1\.2s/)
  assert.match(renderTaskLine({ label: 'Executando npm test', toolName: 'bash', status: 'running' }), /⠹ Executando npm test/)
  assert.match(renderTaskLine({ label: 'Falhou', toolName: 'write', status: 'error', durationMs: 5 }), /✗ Falhou/)
})
