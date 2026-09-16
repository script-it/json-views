import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = fileURLToPath(new URL('..', import.meta.url))
const workspaces = ['packages/core', 'packages/react', 'packages/cli', 'apps/web'].map((directory) => ({
  directory,
  manifest: JSON.parse(readFileSync(path.join(root, directory, 'package.json'), 'utf8')),
}))
const packages = new Map(workspaces.map((workspace) => [workspace.manifest.name, workspace]))
const graph = new Map()
const problems = []
function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) return entry.name === 'test' ? [] : walk(file)
    return /\.(?:ts|tsx|js)$/.test(file) && !/\.test\./.test(file) ? [file] : []
  })
}

for (const { directory, manifest } of workspaces) {
  const packageRoot = path.join(root, directory)
  const files = walk(path.join(packageRoot, directory === 'packages/cli' ? 'bin' : 'src'))
  const dependencies = new Set(Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies }))
  for (const file of files) {
    const fileSource = readFileSync(file, 'utf8')
    const source = ts.createSourceFile(file, fileSource, ts.ScriptTarget.Latest, true)
    const edges = []
    graph.set(file, edges)
    const issue = (message) => problems.push(`${path.relative(root, file)}: ${message}`)
    if (directory === 'packages/react' && path.basename(file) !== 'menu-select.tsx') {
      if (/<select\b/.test(fileSource)) issue('Use the shared MenuSelect primitive instead of a native select')
      if (/profile\s*=\s*["']menu["']/.test(fileSource)) issue('Declare menu-style ChoiceControl behavior only in the shared MenuSelect primitive')
    }
    const checkImport = (specifier, typeOnly) => {
      if (specifier.startsWith('.')) {
        const target = path.resolve(path.dirname(file), specifier.replace(/[?#].*$/, ''))
        if (!target.startsWith(packageRoot + path.sep)) issue(`Import escapes its workspace: ${specifier}`)
        if (/\.(?:tsx?|jsx)$/.test(specifier)) issue(`Use emitted .js extensions: ${specifier}`)
        const resolved = [target, target.replace(/\.js$/, '.ts'), target.replace(/\.js$/, '.tsx')].find(existsSync)
        if (!resolved) issue(`Missing relative import: ${specifier}`)
        if (resolved && /(?:\.test\.|\/test\/)/.test(resolved)) issue(`Production imports test code: ${specifier}`)
        if (resolved && !typeOnly) edges.push(resolved)
        return
      }
      if (specifier.startsWith('node:')) {
        if (directory !== 'packages/cli') issue(`Node API in a browser-compatible package: ${specifier}`)
        return
      }
      const name = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]
      if (!dependencies.has(name)) issue(`Undeclared runtime/peer dependency: ${name}`)
      const internal = packages.get(name)
      if (internal) {
        const subpath = specifier === name ? '.' : '.' + specifier.slice(name.length)
        if (!Object.hasOwn(internal.manifest.exports ?? {}, subpath)) issue(`Import bypasses public exports: ${specifier}`)
        if (directory === 'packages/core' || (directory === 'packages/react' && internal.directory !== 'packages/core')) issue(`Upward package dependency: ${specifier}`)
      }
    }
    const forbidden = new Set(directory === 'packages/core'
      ? ['window', 'document', 'navigator', 'fetch', 'XMLHttpRequest', 'WebSocket', 'localStorage', 'sessionStorage', 'indexedDB']
      : directory === 'packages/react' ? ['fetch', 'XMLHttpRequest', 'WebSocket', 'localStorage', 'sessionStorage', 'indexedDB'] : [])
    const visit = (node) => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        checkImport(node.moduleSpecifier.text, node.isTypeOnly || node.importClause?.isTypeOnly)
      }
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        if (node.arguments.length !== 1 || !ts.isStringLiteral(node.arguments[0])) issue('Dynamic imports must declare a literal dependency')
        else checkImport(node.arguments[0].text, false)
      }
      if (ts.isIdentifier(node) && forbidden.has(node.text)) issue(`Host-owned API in reusable library: ${node.text}`)
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
}

const visited = new Set()
function visit(file, stack = []) {
  if (stack.includes(file)) {
    problems.push(`Runtime import cycle: ${[...stack.slice(stack.indexOf(file)), file].map((item) => path.relative(root, item)).join(' -> ')}`)
    return
  }
  if (visited.has(file)) return
  visited.add(file)
  for (const child of graph.get(file) ?? []) visit(child, [...stack, file])
}
for (const file of graph.keys()) visit(file)
assert.equal(problems.length, 0, '\n' + problems.join('\n'))
console.log(`Architecture checked: ${graph.size} production modules; public package boundaries, declared dependencies, host API isolation, and runtime cycles.`)
