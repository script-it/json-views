import assert from 'node:assert/strict'
import { chmod, lstat, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { request } from 'node:http'
import path from 'node:path'
import test from 'node:test'

import { createJsonViewsServer, run } from '../bin/json-views.js'

async function fixture(context, content = '{"value":1}\n') {
  const directory = await mkdtemp(path.join(tmpdir(), 'json-views-test-'))
  const filePath = path.join(directory, 'data.json')
  const publicDirectory = path.join(directory, 'public')
  await mkdir(publicDirectory)
  await writeFile(filePath, content)
  await writeFile(path.join(publicDirectory, 'index.html'), '<!doctype html><title>JSON Views</title>')
  const server = createJsonViewsServer({ filePath, token: 'test-token', publicDirectory })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  context.after(async () => {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
    await rm(directory, { recursive: true, force: true })
  })
  const address = server.address()
  assert(address && typeof address !== 'string')
  const base = `http://127.0.0.1:${address.port}`
  const endpoint = `${base}/api/document?token=test-token`
  const put = (content, revision, options = {}) => fetch(endpoint, {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content, revision }), ...options,
  })
  return { directory, filePath, publicDirectory, endpoint, base, put }
}

test('preserves exact source on load, update, acknowledgement, and no-op saves', async (context) => {
  const original = '{ "id":9007199254740993,"huge":1e400,"minusZero":-0,"x":1,"x":2 }\n'
  const { filePath, endpoint, put } = await fixture(context, original)
  const opened = await fetch(endpoint).then((response) => response.json())
  assert.equal(opened.content, original)
  const unchangedStat = await stat(filePath)
  assert.equal((await put(original, opened.revision)).status, 200)
  assert.equal((await stat(filePath)).ino, unchangedStat.ino)
  const updated = original.replace('"x":2', '"x":3')
  const response = await put(updated, opened.revision)
  assert.equal(response.status, 200)
  const saved = await response.json()
  assert.equal(saved.content, updated)
  assert.equal(await readFile(filePath, 'utf8'), updated)
  const invalid = '{arbitrary text'
  const invalidResponse = await put(invalid, saved.revision)
  assert.equal(invalidResponse.status, 200)
  assert.equal((await invalidResponse.json()).content, invalid)
  assert.equal(await readFile(filePath, 'utf8'), invalid)
  assert.equal((await put('{"value":3}', opened.revision)).status, 409)
})

test('accepts exactly one concurrent changed snapshot per starting revision', async (context) => {
  const { filePath, endpoint, put } = await fixture(context)
  const opened = await fetch(endpoint).then((response) => response.json())
  const results = await Promise.all(Array.from({ length: 16 }, async (_, value) => {
    const content = JSON.stringify({ writer: value })
    const response = await put(content, opened.revision)
    return { content, status: response.status, saved: response.ok ? await response.json() : null }
  }))
  const winners = results.filter((result) => result.status === 200)
  assert.equal(winners.length, 1)
  assert.equal(results.filter((result) => result.status === 409).length, 15)
  assert.equal(winners[0].saved.content, winners[0].content)
  assert.equal(await readFile(filePath, 'utf8'), winners[0].content)
})

test('detects external edits made before the revision check and recovers invalid source', async (context) => {
  const { filePath, endpoint, put } = await fixture(context)
  const opened = await fetch(endpoint).then((response) => response.json())
  await writeFile(filePath, '{"unfinished":')
  assert.equal((await put('{"value":2}', opened.revision)).status, 409)
  const invalid = await fetch(endpoint).then((response) => response.json())
  assert.equal(invalid.content, '{"unfinished":')
  assert.equal((await put('{"repaired":true}', invalid.revision)).status, 200)
})

test('preserves POSIX file permissions despite umask and keeps symlinks intact', { skip: process.platform === 'win32' }, async (context) => {
  const { filePath, endpoint, put, directory, publicDirectory } = await fixture(context)
  await chmod(filePath, 0o666)
  const original = await stat(filePath)
  const opened = await fetch(endpoint).then((response) => response.json())
  const previousUmask = process.umask(0o077)
  try {
    assert.equal((await put('{"updated":true}', opened.revision)).status, 200)
  } finally {
    process.umask(previousUmask)
  }
  const saved = await stat(filePath)
  assert.equal(saved.mode & 0o777, 0o666)
  assert.equal(saved.uid, original.uid)
  assert.equal(saved.gid, original.gid)
  const linkPath = path.join(directory, 'link.json')
  await symlink(filePath, linkPath)
  const linkedServer = createJsonViewsServer({ filePath: linkPath, token: 'linked', publicDirectory })
  await new Promise((resolve) => linkedServer.listen(0, '127.0.0.1', resolve))
  context.after(() => { linkedServer.closeAllConnections(); linkedServer.close() })
  const linkedAddress = linkedServer.address()
  const linkedEndpoint = `http://127.0.0.1:${linkedAddress.port}/api/document?token=linked`
  const linked = await fetch(linkedEndpoint).then((response) => response.json())
  const response = await fetch(linkedEndpoint, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: '{"throughLink":true}', revision: linked.revision }) })
  assert.equal(response.status, 200)
  assert.equal((await lstat(linkPath)).isSymbolicLink(), true)
  assert.equal(await readFile(filePath, 'utf8'), '{"throughLink":true}')
})

test('rejects unauthenticated, cross-origin, malformed, oversized, and unsafe static requests', async (context) => {
  const { filePath, directory, publicDirectory, endpoint, base, put } = await fixture(context)
  const opened = await fetch(endpoint).then((response) => response.json())
  assert.equal((await fetch(`${base}/api/document`)).status, 403)
  assert.equal((await fetch(endpoint.replace('test-token', 'wrong'))).status, 403)
  assert.equal((await fetch(endpoint, { headers: { origin: 'https://attacker.example' } })).status, 403)
  const spoofedHostStatus = await new Promise((resolve, reject) => {
    const spoofed = request(endpoint, { headers: { host: 'attacker.example' } }, (response) => {
      response.resume()
      resolve(response.statusCode)
    })
    spoofed.on('error', reject)
    spoofed.end()
  })
  assert.equal(spoofedHostStatus, 403)
  assert.equal((await put('{"value":2}', opened.revision, { headers: { 'content-type': 'text/plain' } })).status, 415)
  const arbitrary = await put('invalid', opened.revision)
  assert.equal(arbitrary.status, 200)
  assert.equal(await readFile(filePath, 'utf8'), 'invalid')
  assert.equal((await put('{}', opened.revision, { body: 'null' })).status, 400)
  assert.equal((await put('"' + 'x'.repeat(20 * 1024 * 1024) + '"', opened.revision)).status, 413)
  assert.equal(await readFile(filePath, 'utf8'), 'invalid')
  const index = await fetch(base)
  assert.equal(index.status, 200)
  assert.equal(index.headers.get('referrer-policy'), 'no-referrer')
  assert.match(index.headers.get('content-security-policy'), /frame-ancestors 'none'/)
  await writeFile(path.join(publicDirectory, 'agent-prompt.md'), 'Current instructions')
  assert.equal((await fetch(`${base}/agent-prompt.md`)).headers.get('cache-control'), 'no-store')
  await writeFile(path.join(directory, 'secret.txt'), 'private')
  assert.equal((await fetch(`${base}/%2e%2e%2fsecret.txt`)).status, 404)
  await symlink(path.join(directory, 'secret.txt'), path.join(publicDirectory, 'escape.txt'))
  assert.equal((await fetch(`${base}/escape.txt`)).status, 404)
  assert.equal((await fetch(base, { method: 'HEAD' })).status, 200)
  assert.equal((await fetch(endpoint, { method: 'DELETE' })).status, 405)
})

test('validates CLI arguments and refuses empty capabilities', async (context) => {
  const { filePath } = await fixture(context)
  assert.throws(() => createJsonViewsServer({ filePath, token: '' }), /nonempty/)
  await assert.rejects(run(['--port']), /Port must/)
  await assert.rejects(run(['--port', 'Infinity', filePath]), /Port must/)
  await assert.rejects(run([filePath, '--unknown']), /Unknown option/)
  await assert.rejects(run([filePath, 'second.json']), /one JSON file/)
})
