// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { agentHelp } from '../agent-help.js'

const skillDirectory = join(process.cwd(), '..', '..', 'skills', 'json-views')
const published = {
  'SKILL.md': join(skillDirectory, 'SKILL.md'),
  'references/jsonviews.md': join(skillDirectory, 'references', 'jsonviews.md'),
  'references/html-views.md': join(skillDirectory, 'references', 'html-views.md'),
}

type Middleware = (request: { url?: string }, response: { setHeader: (name: string, value: string) => void; end: (body: unknown) => void }, next: () => void) => void

describe('agent skill publishing', () => {
  it('emits the skill and the references it links to into the site build', () => {
    const emitFile = vi.fn()
    const plugin = agentHelp() as unknown as { generateBundle: (this: { emitFile: typeof emitFile }) => void }
    plugin.generateBundle.call({ emitFile })
    expect(emitFile.mock.calls.map(([asset]) => asset)).toEqual(Object.entries(published).map(([fileName, path]) => ({
      type: 'asset', fileName, source: readFileSync(path, 'utf8'),
    })))
    expect(readFileSync(published['SKILL.md'], 'utf8')).toMatch(/\(references\/jsonviews\.md#/)
  })

  it('serves the same files from the development server', () => {
    let middleware: Middleware | undefined
    const plugin = agentHelp() as unknown as { configureServer: (server: { middlewares: { use: (handler: Middleware) => void } }) => void }
    plugin.configureServer({ middlewares: { use: (handler) => { middleware = handler } } })

    const headers: Record<string, string> = {}
    let body = ''
    const next = vi.fn()
    middleware!({ url: '/SKILL.md?t=1' }, { setHeader: (name, value) => { headers[name] = value }, end: (value) => { body = String(value) } }, next)
    expect(next).not.toHaveBeenCalled()
    expect(headers['Content-Type']).toBe('text/markdown; charset=utf-8')
    expect(body).toBe(readFileSync(published['SKILL.md'], 'utf8'))

    middleware!({ url: '/index.html' }, { setHeader: vi.fn(), end: vi.fn() }, next)
    expect(next).toHaveBeenCalledOnce()
  })
})
