import { z } from 'zod'
import { assertSafeFetchUrl } from '../security/network.js'
import { defineTool } from './tool.js'

export const webFetchTool = defineTool({
  id: 'web_fetch',
  description: 'Fetch text content from a public HTTP/HTTPS URL after network permission approval.',
  parameters: z.object({ url: z.string().url() }),
  async execute(args, ctx) {
    const url = assertSafeFetchUrl(args.url)
    const allowed = await ctx.permissions.require('network', `fetch ${url.toString()}`, { pattern: url.hostname })
    if (!allowed) throw new Error('Permission denied')
    const response = await fetch(url)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const contentType = response.headers.get('content-type') ?? ''
    const text = await response.text()
    return { title: url.toString(), output: text, metadata: { contentType, status: response.status } }
  },
})
