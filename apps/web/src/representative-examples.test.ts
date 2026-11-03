import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { compileJsonViewMetadata, createDefaultTypeRegistry, validateCsvSource } from '@script-it/json-views-core'

interface ManifestEntry {
  id: string
  documentId: string
  sourceFile: string
  annotationFile?: string
  relativePath?: string
  sourceSha256: string
  bytes: number
}

const examplesDirectory = join(process.cwd(), 'public', 'representative-examples')
const manifest = JSON.parse(readFileSync(join(examplesDirectory, 'manifest.json'), 'utf8')) as ManifestEntry[]
const exampleIds = [
  'task-management',
  'research-sprint',
  'decision-comparison',
] as const

describe('bundled examples', () => {
  it('opens the guide and validates the flattened built-in documents', () => {
    const guide = JSON.parse(readFileSync(join(examplesDirectory, manifest[0].sourceFile), 'utf8'))
    const compiled = compileJsonViewMetadata(guide)
    expect(compiled.diagnostics).toEqual([])
    expect(compiled.views).toHaveLength(2)
    expect(compiled.views[0].display).toBe('adaptive')
    expect(compiled.views[1].value).toEqual(guide.articles)
    expect(guide.articles).toHaveLength(7)
    expect(new Set(manifest.map(entry => entry.documentId)).size).toBe(manifest.length)
    expect(manifest.every(entry => !!entry.documentId)).toBe(true)
    for (const entry of manifest) {
      const source = readFileSync(join(examplesDirectory, entry.sourceFile), 'utf8')
      expect(Buffer.byteLength(source)).toBe(entry.bytes)
      expect(createHash('sha256').update(source).digest('hex')).toBe(entry.sourceSha256)
      if (entry.sourceFile.endsWith('.csv')) {
        expect(() => validateCsvSource(source)).not.toThrow()
      } else if (!entry.annotationFile) {
        expect(compileJsonViewMetadata(JSON.parse(source)).diagnostics).toEqual([])
      }
      expect(entry.sourceFile).not.toMatch(/^(Templates|Examples)\//)
    }
    expect(manifest.some((entry) => entry.id === 'array-root' || entry.id === 'llm-messages')).toBe(false)
  })

  it('ships every guide asset and links only to current bundled documents', () => {
    const guide = JSON.parse(readFileSync(join(examplesDirectory, manifest[0].sourceFile), 'utf8'))
    const bodies = guide.articles.map((article: { body: string }) => article.body).join('\n')
    for (const match of bodies.matchAll(/\.\/landing-assets\/([^"\s)]+)/g)) {
      expect(existsSync(join(examplesDirectory, '..', 'landing-assets', match[1]))).toBe(true)
    }
    for (const match of bodies.matchAll(/#\/files\/([^/"\s)]+)/g)) {
      const filename = decodeURIComponent(match[1])
      expect(manifest.some(entry => (entry.relativePath ?? entry.sourceFile) === filename)).toBe(true)
    }
    expect(bodies).not.toContain('LLM Messages')
    expect(bodies).not.toContain('/Templates/')
  })

  it.each(exampleIds)('ships a valid, integrity-checked %s document', (id) => {
    const entry = manifest.find((candidate) => candidate.id === id)
    expect(entry).toBeDefined()

    const sourceText = readFileSync(join(examplesDirectory, entry!.sourceFile), 'utf8')
    const metadata = JSON.parse(readFileSync(join(examplesDirectory, entry!.annotationFile!), 'utf8')) as Record<string, unknown>
    const source = JSON.parse(sourceText) as unknown
    const compiled = compileJsonViewMetadata(source, createDefaultTypeRegistry(), { metadata })

    expect(Buffer.byteLength(sourceText)).toBe(entry!.bytes)
    expect(createHash('sha256').update(sourceText).digest('hex')).toBe(entry!.sourceSha256)
    if (id === 'task-management') {
      expect(compiled.views[0].display).toBe('kanban')
      expect((metadata.views as Array<{ id: string }>).map(view => view.id)).toEqual(['task-board', 'project-dashboard', 'all-tasks', 'open-tasks'])
      expect(compiled.views[0].groupOrder).toEqual(['To do', 'In progress', 'Done'])
      const tasks = (source as { tasks: Array<{ status: string; done: boolean }> }).tasks
      expect(tasks).toHaveLength(18)
      expect([...new Set(tasks.map((task) => task.status))].sort()).toEqual(['Done', 'In progress', 'To do'])
      expect(tasks.every((task) => task.done === (task.status === 'Done'))).toBe(true)
    }
    expect(compiled.status).toBe('ready')
    expect(compiled.diagnostics).toEqual([])
    expect(compiled.views.length).toBeGreaterThanOrEqual(3)
  })

})
