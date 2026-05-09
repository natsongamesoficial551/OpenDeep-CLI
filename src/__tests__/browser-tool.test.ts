import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { AddressInfo } from 'node:net'
import { DEFAULT_CONFIG } from '../config/config.js'
import { PermissionManager } from '../permissions/permissions.js'
import { runTool } from '../tools/registry.js'

function ctx() {
  return {
    cwd: process.cwd(),
    sessionId: 'browser-test',
    agent: 'test',
    permissions: new PermissionManager({ ...DEFAULT_CONFIG, permissions: { ...DEFAULT_CONFIG.permissions, autoAllow: true } }, `browser-${Date.now()}`),
    metadata: async () => {},
  }
}

async function withServer(html: string, run: (url: string) => Promise<void>) {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' })
    response.end(html)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const address = server.address() as AddressInfo
    await run(`http://127.0.0.1:${address.port}`)
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
}

test('browser_check reports clean pages', async () => {
  await withServer('<!doctype html><title>OK</title><main id="app">ready</main>', async (url) => {
    const result = await runTool('browser_check', { url, selector: '#app', waitMs: 250 }, ctx())
    assert.match(result.output, /status: ok/)
    assert.match(result.output, /title: OK/)
  })
})

test('browser_check reports console errors', async () => {
  await withServer('<!doctype html><title>Broken</title><script>console.error("boom")</script>', async (url) => {
    const result = await runTool('browser_check', { url, waitMs: 250 }, ctx())
    assert.match(result.output, /status: issues/)
    assert.match(result.output, /console\.error: boom/)
  })
})
