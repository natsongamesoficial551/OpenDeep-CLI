import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { chromium } from 'playwright'
import { defineTool } from './tool.js'

function isAllowedBrowserUrl(rawUrl: string) {
  const url = new URL(rawUrl)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only http/https URLs are allowed')
  return url
}

export const browserCheckTool = defineTool({
  id: 'browser_check',
  description: 'Open a URL in a browser and report page, console, and network issues.',
  parameters: z.object({
    url: z.string().url(),
    waitMs: z.number().int().positive().max(30_000).default(2_000),
    selector: z.string().optional(),
    screenshot: z.boolean().default(false),
  }),
  async execute(args, ctx) {
    const url = isAllowedBrowserUrl(args.url)
    const allowed = await ctx.permissions.require('network', `browser_check ${url.toString()}`, { pattern: url.toString() })
    if (!allowed) throw new Error('Permission denied')

    const consoleErrors: string[] = []
    const pageErrors: string[] = []
    const failedRequests: string[] = []
    let screenshotPath: string | undefined
    const browser = await chromium.launch({ headless: true })
    try {
      const page = await browser.newPage()
      page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text())
      })
      page.on('pageerror', (error) => pageErrors.push(error.message))
      page.on('requestfailed', (request) => failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? 'failed'}`))

      const response = await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: Math.max(args.waitMs, 5_000) })
      await page.waitForTimeout(args.waitMs)
      if (args.selector) await page.waitForSelector(args.selector, { timeout: Math.max(args.waitMs, 5_000) })
      if (args.screenshot) {
        const dir = await mkdtemp(join(tmpdir(), 'opendeep-browser-'))
        screenshotPath = join(dir, 'screenshot.png')
        await page.screenshot({ path: screenshotPath, fullPage: true })
      }

      const title = await page.title()
      const status = response?.status() ?? 0
      const issues = [...consoleErrors.map((item) => `console.error: ${item}`), ...pageErrors.map((item) => `pageerror: ${item}`), ...failedRequests.map((item) => `requestfailed: ${item}`)]
      const lines = [
        `status: ${issues.length ? 'issues' : 'ok'}`,
        `url: ${page.url()}`,
        `title: ${title || '(untitled)'}`,
        `httpStatus: ${status}`,
        ...(args.selector ? [`selector: ${args.selector} found`] : []),
        ...(screenshotPath ? [`screenshot: ${screenshotPath}`] : []),
        '',
        'issues:',
        issues.length ? issues.join('\n') : '(none)',
      ]
      return { title: `browser_check ${url.toString()}`, output: lines.join('\n'), metadata: { status: issues.length ? 'issues' : 'ok', httpStatus: status, screenshotPath }, attachments: screenshotPath ? [{ path: screenshotPath, mime: 'image/png' }] : undefined }
    } finally {
      await browser.close()
    }
  },
})
