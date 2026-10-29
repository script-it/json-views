import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

interface ManifestEntry {
  sourceFile: string
  annotationFile?: string
  relativePath?: string
}

const publicDirectory = join(process.cwd(), 'public')
const examplesDirectory = join(publicDirectory, 'representative-examples')
const manifest = JSON.parse(readFileSync(join(examplesDirectory, 'manifest.json'), 'utf8')) as ManifestEntry[]
const guide = JSON.parse(readFileSync(join(examplesDirectory, 'About JSON Views.json'), 'utf8'))
const page: string = guide.articles[0].body
const targets = [...page.matchAll(/\]\(([^)\s]+)(?: "[^"]*")?\)/g)].map(([, target]) => target)

function exampleViews(file: string): string[] {
  const entry = manifest.find((candidate) => (candidate.relativePath ?? candidate.sourceFile) === file)
  if (!entry) throw new Error(`“${file}” is not a bundled example`)
  const metadata = entry.annotationFile
    ? JSON.parse(readFileSync(join(examplesDirectory, entry.annotationFile), 'utf8'))
    : JSON.parse(readFileSync(join(examplesDirectory, entry.sourceFile), 'utf8')).$jsonviews
  return (metadata?.views ?? []).map((view: { name: string }) => view.name)
}

describe('landing page', () => {
  it('opens the guide on the "What is this?" article and keeps every article', () => {
    expect(guide.$jsonviews.views.map(({ name, path }: { name: string; path: string }) => ({ name, path }))).toEqual([
      { name: 'What is this?', path: '$.articles[0].body' },
      { name: 'Articles', path: '$.articles' },
    ])
    expect(guide.articles[0].title).toBe('What is this?')
    expect(guide.articles).toHaveLength(7)
  })

  it('links only to bundled files and views that exist', () => {
    const routes = targets.filter((target) => target.startsWith('#/files/'))
    expect(routes.length).toBeGreaterThan(10)
    for (const route of routes) {
      const match = /^#\/files\/([^/]+)\/views\/([^/]+)$/.exec(route)
      expect(match, route).not.toBeNull()
      const [file, view] = [decodeURIComponent(match![1]), decodeURIComponent(match![2])]
      expect(exampleViews(file), route).toContain(view)
    }
  })

  it('shows only images that ship with the site', () => {
    const images = [...page.matchAll(/!\[[^\]]*\]\((\.\/[^)\s]+)\)/g)].map(([, source]) => source)
    expect(images.length).toBeGreaterThan(5)
    for (const image of images) expect(existsSync(join(publicDirectory, image)), image).toBe(true)
  })

  it('jumps only to headings on the page', () => {
    const slugs = [...page.matchAll(/^#{1,4} (.+)$/gm)].map(([, text]) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-'))
    const jumps = targets.filter((target) => /^#[a-z][a-z0-9-]*$/.test(target))
    expect(jumps).toContain('#run-it-locally')
    for (const jump of jumps) expect(slugs.some((slug) => slug.includes(jump.slice(1))), jump).toBe(true)
  })

  it('installs the agent skill from json-views.com', () => {
    const agentLinks = targets.filter((target) => /^(claude|codex|cursor|grokbot):/.test(target))
    expect(new Set(agentLinks.map((target) => target.split(':')[0]))).toEqual(new Set(['claude', 'codex', 'cursor', 'grokbot']))
    for (const target of agentLinks) {
      const prompt = decodeURIComponent(target)
      expect(prompt, target).toContain('https://json-views.com/SKILL.md')
      expect(prompt, target).toMatch(/json-views[/.]/)
      expect(prompt, target).not.toContain('json-view.com')
    }
  })

  it('copies a setup prompt that names the repository skill', () => {
    const copies = targets.filter((target) => target.startsWith('#copy:'))
    expect(copies.length).toBeGreaterThan(0)
    for (const copy of copies) {
      expect(decodeURIComponent(copy.slice('#copy:'.length))).toContain('npx skills add script-it/json-views')
    }
  })
})
