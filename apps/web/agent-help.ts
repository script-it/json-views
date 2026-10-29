import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

const skillPath = fileURLToPath(new URL('../../skills/json-views/SKILL.md', import.meta.url))
const referencePath = fileURLToPath(new URL('../../skills/json-views/references/jsonviews.md', import.meta.url))
const htmlReferencePath = fileURLToPath(new URL('../../skills/json-views/references/html-views.md', import.meta.url))
const sourcePaths = [skillPath, referencePath, htmlReferencePath]
const bundledPath = fileURLToPath(new URL('./src/agent-help.md', import.meta.url))
// The skill is also served as files, so agents can install it from the site.
// Its relative reference links resolve against /SKILL.md.
const publishedSkillFiles = [
  { fileName: 'SKILL.md', path: skillPath },
  { fileName: 'references/jsonviews.md', path: referencePath },
  { fileName: 'references/html-views.md', path: htmlReferencePath },
]

/** Bundle the main guide and its nuances so browser help stays self-contained. */
export function agentHelp(): Plugin {
  const sync = () => {
    const guide = readFileSync(skillPath, 'utf8')
      .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n\s*/, '')
      .replace(/\]\(references\/(?:jsonviews|html-views)\.md(#[^)]+)\)/g, ']($1)')
    const text = `${guide.trimEnd()}\n\n${readFileSync(referencePath, 'utf8').trimEnd()}\n\n${readFileSync(htmlReferencePath, 'utf8')}`
    if (!existsSync(bundledPath) || readFileSync(bundledPath, 'utf8') !== text) {
      writeFileSync(bundledPath, text)
    }
  }
  sync()
  return {
    name: 'json-views-agent-help',
    buildStart() { for (const path of sourcePaths) this.addWatchFile(path) },
    watchChange(id) { if (sourcePaths.includes(id)) sync() },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const file = publishedSkillFiles.find(({ fileName }) => request.url?.split('?')[0] === `/${fileName}`)
        if (!file) return next()
        response.setHeader('Content-Type', 'text/markdown; charset=utf-8')
        response.end(readFileSync(file.path))
      })
    },
    generateBundle() {
      for (const { fileName, path } of publishedSkillFiles) this.emitFile({ type: 'asset', fileName, source: readFileSync(path, 'utf8') })
    },
  }
}
