#!/usr/bin/env node

import { createHash, randomBytes } from 'node:crypto'
import { createReadStream, realpathSync } from 'node:fs'
import { open, readFile, realpath, rename, stat, unlink } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url))
const defaultPublicDirectory = path.resolve(moduleDirectory, '..', 'public')
const MAX_BODY_BYTES = 20 * 1024 * 1024
const documentQueues = new Map()

class RequestError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function serializeDocumentWrite(filePath, operation) {
  const previous = documentQueues.get(filePath) ?? Promise.resolve()
  const current = previous.catch(() => undefined).then(operation)
  documentQueues.set(filePath, current)
  void current.finally(() => {
    if (documentQueues.get(filePath) === current) documentQueues.delete(filePath)
  }).catch(() => undefined)
  return current
}

function revisionOf(content) {
  return createHash('sha256').update(content).digest('hex')
}

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase()
  return ({
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
  })[extension] || 'application/octet-stream'
}

function send(response, status, body, type = 'text/plain; charset=utf-8') {
  response.writeHead(status, {
    'content-type': type,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'content-security-policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'",
  })
  response.end(body)
}

async function readBody(request) {
  const chunks = []
  let bytes = 0
  for await (const chunk of request) {
    bytes += chunk.length
    if (bytes > MAX_BODY_BYTES) throw new RequestError(413, 'Request exceeds the 20 MB local limit')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function readDocument(filePath) {
  const content = await readFile(filePath, 'utf8')
  return {
    content,
    filename: path.basename(filePath),
    revision: revisionOf(content),
  }
}

async function atomicWrite(filePath, content) {
  const fileStat = await stat(filePath)
  if (!fileStat.isFile()) throw new RequestError(400, 'The destination is not a regular file')
  const temporaryPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.json-views-${process.pid}-${randomBytes(6).toString('hex')}`,
  )
  let temporary
  try {
    temporary = await open(temporaryPath, 'wx', 0o600)
    await temporary.writeFile(content, 'utf8')
    if (process.platform !== 'win32') {
      const temporaryStat = await temporary.stat()
      if (temporaryStat.uid !== fileStat.uid || temporaryStat.gid !== fileStat.gid) {
        await temporary.chown(fileStat.uid, fileStat.gid)
      }
    }
    await temporary.chmod(fileStat.mode & 0o7777)
    await temporary.sync()
    await temporary.close()
    temporary = undefined
    await rename(temporaryPath, filePath)
  } finally {
    await temporary?.close()
    await unlink(temporaryPath).catch(() => undefined)
  }
}

export function createJsonViewsServer({ filePath, token, publicDirectory = defaultPublicDirectory }) {
  if (typeof token !== 'string' || token.length === 0) throw new Error('A nonempty session token is required')
  // Resolve a supplied symlink once so subsequent saves replace its target, not the link.
  const destination = realpathSync(filePath)
  const publicRoot = path.resolve(publicDirectory)
  const server = createServer(async (request, response) => {
    try {
      const address = server.address()
      const port = address && typeof address !== 'string' ? address.port : 0
      if (request.headers.host !== `127.0.0.1:${port}` && request.headers.host !== `localhost:${port}`) {
        return send(response, 403, 'Invalid local host')
      }
      const url = new URL(request.url || '/', `http://${request.headers.host}`)
      if (url.pathname === '/api/document') {
        if (url.searchParams.get('token') !== token) return send(response, 403, 'Invalid session token')
        const origin = request.headers.origin
        if (origin && origin !== `http://${request.headers.host}`) return send(response, 403, 'Cross-origin requests are not allowed')
        if (request.method === 'GET') {
          return send(response, 200, JSON.stringify(await readDocument(destination)), 'application/json; charset=utf-8')
        }
        if (request.method === 'PUT') {
          if (request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
            return send(response, 415, 'Expected application/json')
          }
          const payload = JSON.parse(await readBody(request))
          if (!payload || typeof payload !== 'object' || Array.isArray(payload)
            || typeof payload.content !== 'string' || typeof payload.revision !== 'string') {
            return send(response, 400, 'Expected content and revision')
          }
          const saved = await serializeDocumentWrite(destination, async () => {
            const current = await readDocument(destination)
            if (current.revision !== payload.revision) {
              throw new RequestError(409, 'The file changed on disk. Download your draft, then reload the local file before saving.')
            }
            if (current.content !== payload.content) await atomicWrite(destination, payload.content)
            return { content: payload.content, filename: current.filename, revision: revisionOf(payload.content) }
          })
          return send(response, 200, JSON.stringify(saved), 'application/json; charset=utf-8')
        }
        response.setHeader('allow', 'GET, PUT')
        return send(response, 405, 'Method not allowed')
      }

      if (request.method !== 'GET' && request.method !== 'HEAD') return send(response, 405, 'Method not allowed')
      let requested
      try { requested = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname) } catch {
        return send(response, 404, 'Not found')
      }
      const resolved = path.resolve(publicRoot, `.${requested}`)
      if (!resolved.startsWith(`${publicRoot}${path.sep}`)) return send(response, 404, 'Not found')
      const canonicalRoot = await realpath(publicRoot).catch(() => null)
      const canonical = await realpath(resolved).catch(() => null)
      if (!canonicalRoot || !canonical || !canonical.startsWith(`${canonicalRoot}${path.sep}`)) return send(response, 404, 'Not found')
      const fileStat = await stat(canonical).catch(() => null)
      if (!fileStat?.isFile()) return send(response, 404, 'Not found')
      response.writeHead(200, {
        'content-type': contentType(canonical),
        // Only content-hashed build assets remain immutable across CLI upgrades.
        'cache-control': /[/\\]assets[/\\].+-[\w-]{8,}\.[\w]+$/.test(canonical) ? 'public, max-age=31536000, immutable' : 'no-store',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
        'content-security-policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'",
      })
      if (request.method === 'HEAD') return response.end()
      createReadStream(canonical).on('error', () => response.destroy()).pipe(response)
    } catch (error) {
      const status = error instanceof RequestError ? error.status : error instanceof SyntaxError ? 400 : 500
      const message = error instanceof SyntaxError ? `Invalid JSON: ${error.message}` : error instanceof Error ? error.message : 'Unexpected error'
      send(response, status, message)
    }
  })
  return server
}

function openBrowser(url) {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open'
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url]
  const browser = spawn(command, args, { detached: true, stdio: 'ignore' })
  browser.on('error', () => console.error('Could not open a browser automatically. Open the printed URL manually.'))
  browser.unref()
}

function usage() {
  return `Usage: json-views <file.json> [--port <number>] [--no-open]\n\nOpens one explicit local JSON file. Browser edits are validated and written atomically.`
}

export async function run(argv = process.argv.slice(2)) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(usage())
    return
  }
  let fileArgument
  let requestedPort = 0
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--port') {
      const value = argv[++index]
      if (!value || !/^\d+$/.test(value)) throw new Error('Port must be between 0 and 65535')
      requestedPort = Number(value)
    } else if (argument === '--no-open') {
      continue
    } else if (argument.startsWith('-')) {
      throw new Error(`Unknown option: ${argument}`)
    } else if (fileArgument) {
      throw new Error('Open one JSON file at a time')
    } else {
      fileArgument = argument
    }
  }
  if (!fileArgument) throw new Error(usage())
  if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65535) throw new Error('Port must be between 0 and 65535')

  const filePath = path.resolve(fileArgument)
  const fileStat = await stat(filePath)
  if (!fileStat.isFile()) throw new Error(`${filePath} is not a file`)
  await readDocument(filePath)

  const token = randomBytes(24).toString('base64url')
  const server = createJsonViewsServer({ filePath, token })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(requestedPort, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Could not start local server')
  const url = `http://127.0.0.1:${address.port}/?token=${encodeURIComponent(token)}`
  console.log(`JSON Views: ${filePath}`)
  console.log(`Open: ${url}`)
  console.log(`Agent API: GET/PUT http://127.0.0.1:${address.port}/api/document?token=${encodeURIComponent(token)}`)
  if (!argv.includes('--no-open')) openBrowser(url)
}

if (process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
