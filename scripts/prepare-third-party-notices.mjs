import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const visited = new Set()
const notices = new Map()

function locate(name, from) {
  for (let directory = from; ; directory = path.dirname(directory)) {
    const manifest = path.join(directory, 'node_modules', name, 'package.json')
    if (existsSync(manifest)) return realpathSync(manifest)
    if (path.dirname(directory) === directory) throw new Error(`Cannot locate dependency ${name}`)
  }
}

function visit(manifestPath) {
  if (visited.has(manifestPath)) return
  visited.add(manifestPath)
  const directory = path.dirname(manifestPath)
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (!manifest.name.startsWith('@script-it/')) {
    let files = readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /^(licen[cs]e|copying|notice)(\.|$)/i.test(entry.name))
      .map((entry) => path.join(directory, entry.name)).sort()
    if (files.length === 0 && manifest.name === 'react-remove-scroll-bar' && manifest.version === '2.3.8') {
      files = [path.join(root, 'licenses', 'react-remove-scroll-bar-2.3.8.txt')]
    }
    if (files.length === 0) throw new Error(`Review missing third-party license: ${manifest.name}@${manifest.version}`)
    notices.set(`${manifest.name}@${manifest.version}`, files.map((file) => readFileSync(file, 'utf8').trim()).join('\n\n'))
  }
  for (const name of Object.keys(manifest.dependencies ?? {}).sort()) visit(locate(name, directory))
}

for (const name of ['apps/web', 'packages/core', 'packages/react']) visit(path.join(root, name, 'package.json'))
// The distributed stylesheet contains generated Tailwind foundation styles.
visit(locate('tailwindcss', root))
const text = 'Third-party notices\n\nDependencies used by JSON Views packages and the browser distribution.\n\n'
  + [...notices].sort(([a], [b]) => a.localeCompare(b)).map(([name, license]) => `${name}\n${'='.repeat(name.length)}\n${license}`).join('\n\n') + '\n'
for (const directory of ['apps/web/public', 'packages/core', 'packages/react', 'packages/cli']) {
  await mkdir(path.join(root, directory), { recursive: true })
  await writeFile(path.join(root, directory, 'THIRD_PARTY_NOTICES.txt'), text)
}
console.log(`Prepared notices for ${notices.size} dependency versions.`)
