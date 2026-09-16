import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { cp, lstat, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const temporary = await mkdtemp(path.join(tmpdir(), 'json-views-consumer-'))
const consumer = path.join(temporary, 'consumer')
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const keep = process.env.JSON_VIEWS_KEEP_CONSUMER === '1'

function command(binary, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { cwd, env: { ...process.env, npm_config_audit: 'false', npm_config_fund: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.once('error', reject)
    child.once('close', (code, signal) => {
      if (code === 0) resolve(stdout)
      else reject(new Error(`${binary} ${args.join(' ')} failed (${signal ?? code})\n${stdout}\n${stderr}`))
    })
  })
}

async function runCliSmoke() {
  const original = '{ "id": 9007199254740993, "value": 1 }\n'
  const filePath = path.join(temporary, 'local-document.json')
  await writeFile(filePath, original)
  const executable = process.platform === 'win32' ? process.execPath : path.join(consumer, 'node_modules', '.bin', 'json-views')
  const args = [filePath, '--no-open']
  if (process.platform === 'win32') args.unshift(path.join(consumer, 'node_modules', '@script-it', 'json-views', 'bin', 'json-views.js'))
  const cli = spawn(executable, args, { cwd: consumer, stdio: ['ignore', 'pipe', 'pipe'] })
  let stderr = ''
  cli.stderr.on('data', (chunk) => { stderr += chunk })
  const closed = new Promise((resolve) => cli.once('close', resolve))
  try {
    const sessionUrl = await new Promise((resolve, reject) => {
      let stdout = ''
      const timeout = setTimeout(() => reject(new Error(`CLI did not start within 20 seconds. ${stderr}`)), 20_000)
      cli.once('error', (error) => { clearTimeout(timeout); reject(error) })
      cli.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`CLI exited before startup (${code}). ${stderr}`)) })
      cli.stdout.on('data', (chunk) => {
        stdout += chunk
        const match = stdout.match(/Open: (http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+)/)
        if (match) { clearTimeout(timeout); resolve(match[1]) }
      })
    })
    const url = new URL(sessionUrl)
    const documentUrl = new URL('/api/document', url)
    documentUrl.search = url.search
    const opened = await fetch(documentUrl)
    assert.equal(opened.status, 200)
    const document = await opened.json()
    assert.equal(document.content, original)
    const page = await fetch(url)
    assert.equal(page.status, 200)
    const html = await page.text()
    const asset = html.match(/<script[^>]+src="([^"]+)"/)
    assert(asset, 'The installed CLI must include the built browser entrypoint')
    assert.equal((await fetch(new URL(asset[1], url))).status, 200)
    const noticesResponse = await fetch(new URL('/THIRD_PARTY_NOTICES.txt', url))
    assert.equal(noticesResponse.status, 200, 'The installed CLI must serve third-party notices')
    const notices = await noticesResponse.text()
    assert.match(notices, /^re2js@\S+\r?\n=+\r?\nMIT License/m, 'RE2JS license notice must be served')
    assert.match(notices, /^react@\S+\r?\n=+\r?\nMIT License/m, 'React license notice must be served')
    const content = original.replace('"value": 1', '"value": 2')
    const response = await fetch(documentUrl, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content, revision: document.revision }) })
    assert.equal(response.status, 200)
    assert.equal((await response.json()).content, content)
    assert.equal(await readFile(filePath, 'utf8'), content)
    console.log('Installed CLI executable, static assets, third-party notices, authenticated API, and exact local file write passed.')
  } finally {
    if (cli.exitCode === null) cli.kill('SIGTERM')
    await closed
  }
}

try {
  await cp(path.join(root, 'examples', 'consumer'), consumer, { recursive: true })
  const manifestPath = path.join(consumer, 'package.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const reactMajor = process.env.JSON_VIEWS_CONSUMER_REACT_MAJOR ?? '19'
  assert(['18', '19'].includes(reactMajor), 'JSON_VIEWS_CONSUMER_REACT_MAJOR must be 18 or 19')
  if (reactMajor === '18') {
    manifest.dependencies.react = '^18.3.1'
    manifest.dependencies['react-dom'] = '^18.3.1'
    manifest.devDependencies['@types/react'] = '^18.3.0'
    manifest.devDependencies['@types/react-dom'] = '^18.3.0'
  }
  console.log(`Testing React ${reactMajor} consumer.`)
  for (const workspace of ['packages/core', 'packages/react', 'packages/cli']) {
    const packed = JSON.parse(await command(npm, ['pack', '--ignore-scripts', '--json', '--pack-destination', temporary], path.join(root, workspace)))[0]
    const files = new Set(packed.files.map((file) => file.path))
    assert(files.has('LICENSE'), `${packed.name} tarball must include LICENSE`)
    assert(files.has('THIRD_PARTY_NOTICES.txt'), `${packed.name} tarball must include THIRD_PARTY_NOTICES.txt`)
    assert(files.has('README.md'), `${packed.name} tarball must include README.md`)
    assert(files.has('package.json'), `${packed.name} tarball must include package.json`)
    const packageManifest = JSON.parse(await readFile(path.join(root, workspace, 'package.json'), 'utf8'))
    const targets = (value) => typeof value === 'string' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(targets) : []
    for (const target of [...targets(packageManifest.exports), ...targets(packageManifest.bin)]) {
      assert(files.has(target.replace(/^\.\//, '')), `${packed.name} export ${target} must exist in its tarball`)
    }
    if (workspace === 'packages/cli') {
      assert(files.has('public/index.html'), 'CLI tarball must contain the built web application')
      assert(files.has('public/THIRD_PARTY_NOTICES.txt'), 'CLI tarball must contain public third-party notices')
    } else assert(files.has('dist/index.js') && files.has('dist/index.d.ts'), `${packed.name} must contain JavaScript and declaration entrypoints`)
    manifest.dependencies[packed.name] = `file:${path.join(temporary, packed.filename)}`
    console.log(`Packed ${packed.name}: notices and distribution files verified.`)
  }
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log('Installing tarballs into an independent production-only consumer…')
  await command(npm, ['install', '--ignore-scripts', '--omit=dev', '--no-audit', '--no-fund'], consumer)
  for (const name of ['json-views-core', 'json-views-react', 'json-views']) {
    const installed = path.join(consumer, 'node_modules', '@script-it', name)
    assert.equal((await lstat(installed)).isSymbolicLink(), false, `${name} must be installed from its tarball`)
    assert((await realpath(installed)).startsWith(`${await realpath(consumer)}${path.sep}`), `${name} must not resolve into the workspace`)
  }
  console.log((await command(process.execPath, ['node-smoke.mjs'], consumer)).trim())
  await runCliSmoke()
  console.log('Installing independent consumer build tools…')
  await command(npm, ['install', '--ignore-scripts', '--include=dev', '--no-audit', '--no-fund'], consumer)
  await command(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.json'], consumer)
  await command(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], consumer)
  assert.match(await readFile(path.join(consumer, 'dist', 'index.html'), 'utf8'), /assets\//)
  console.log('Strict NodeNext declarations and production browser bundle passed without aliases.')
} finally {
  if (keep) console.log(`Packed consumer retained at ${temporary}`)
  else await rm(temporary, { recursive: true, force: true })
}
