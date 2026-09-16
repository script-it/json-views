import { validateCsvSource } from '@script-it/json-views-core'

export const SHARE_URL = 'https://json-views.com/'
export const SHARE_LINK_WARNING_LENGTH = 8 * 1024
export const MAX_SHARE_LINK_LENGTH = 32 * 1024

const JSON_SHARE_HASH_KEY = 'json'
const CSV_SHARE_HASH_KEY = 'csv'
const SHARE_FORMAT_VERSION = 'v1'
const MAX_ENCODED_PAYLOAD_LENGTH = 2 * 1024 * 1024
const MAX_DECOMPRESSED_PAYLOAD_LENGTH = 8 * 1024 * 1024

export type ShareDocumentFormat = 'json' | 'csv'

export interface ShareDocument {
  filename: string
  source: string
}

export interface ShareLink {
  length: number
  url: string
  warning: boolean
}

interface ShareEnvelope {
  version: 1
  filename: string
  source: string
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function base64UrlToBytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('The shared document payload is not valid base64url data')
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function byteStream(bytes: Uint8Array): ReadableStream<Uint8Array<ArrayBuffer>> {
  const ownedBytes = new Uint8Array(bytes.byteLength)
  ownedBytes.set(bytes)
  return new ReadableStream({
    start(controller) {
      controller.enqueue(ownedBytes)
      controller.close()
    },
  })
}

async function compress(value: string): Promise<{ encoding: 'g' | 'u'; bytes: Uint8Array }> {
  const bytes = new TextEncoder().encode(value)
  if (typeof CompressionStream === 'undefined') return { encoding: 'u', bytes }
  const stream = byteStream(bytes).pipeThrough(new CompressionStream('gzip'))
  return { encoding: 'g', bytes: new Uint8Array(await new Response(stream).arrayBuffer()) }
}

async function decompress(bytes: Uint8Array, encoding: string): Promise<string> {
  if (encoding === 'u') return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  if (encoding !== 'g') throw new Error('This shared document link uses an unsupported encoding')
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot open compressed document share links')

  const stream = byteStream(bytes).pipeThrough(new DecompressionStream('gzip'))
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    length += value.byteLength
    if (length > MAX_DECOMPRESSED_PAYLOAD_LENGTH) {
      await reader.cancel()
      throw new Error('The shared document expands beyond the supported size')
    }
    chunks.push(value)
  }
  const decompressed = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    decompressed.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(decompressed)
}

function sharePayload(hash: string): { format: ShareDocumentFormat; value: string } | undefined {
  const parameters = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)
  const json = parameters.get(JSON_SHARE_HASH_KEY)
  const csv = parameters.get(CSV_SHARE_HASH_KEY)
  if (json !== null && csv !== null) throw new Error('The share link contains more than one document')
  if (json !== null) return { format: 'json', value: json }
  if (csv !== null) return { format: 'csv', value: csv }
  return undefined
}

function documentFormat(filename: string): ShareDocumentFormat {
  return /\.csv$/i.test(filename) ? 'csv' : 'json'
}

function validateSource(format: ShareDocumentFormat, source: string): void {
  if (format === 'csv') validateCsvSource(source)
  else JSON.parse(source)
}

export function hasShareHash(hash: string): boolean {
  const parameters = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)
  return parameters.has(JSON_SHARE_HASH_KEY) || parameters.has(CSV_SHARE_HASH_KEY)
}

export async function createShareLink(document: ShareDocument, baseUrl = SHARE_URL): Promise<ShareLink> {
  const format = documentFormat(document.filename)
  validateSource(format, document.source)
  const envelope: ShareEnvelope = { version: 1, filename: document.filename, source: document.source }
  const { bytes, encoding } = await compress(JSON.stringify(envelope))
  const url = new URL(baseUrl)
  url.search = ''
  url.hash = `${format === 'csv' ? CSV_SHARE_HASH_KEY : JSON_SHARE_HASH_KEY}=${SHARE_FORMAT_VERSION}.${encoding}.${bytesToBase64Url(bytes)}`
  const serialized = url.toString()
  return {
    length: serialized.length,
    url: serialized,
    warning: serialized.length > SHARE_LINK_WARNING_LENGTH,
  }
}

export async function readShareHash(hash: string): Promise<ShareDocument | undefined> {
  const payload = sharePayload(hash)
  if (payload === undefined) return undefined
  const { format, value } = payload
  if (value.length > MAX_ENCODED_PAYLOAD_LENGTH) throw new Error('The shared document link is too large to open safely')
  const [version, encoding, encoded, ...extra] = value.split('.')
  if (version !== SHARE_FORMAT_VERSION || !encoding || !encoded || extra.length > 0) {
    throw new Error('The shared document link format is not supported')
  }
  const parsed: unknown = JSON.parse(await decompress(base64UrlToBytes(encoded), encoding))
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('The shared document payload is invalid')
  const envelope = parsed as Partial<ShareEnvelope>
  if (envelope.version !== 1 || typeof envelope.filename !== 'string' || typeof envelope.source !== 'string') {
    throw new Error('The shared document payload is invalid')
  }
  if (documentFormat(envelope.filename) !== format) throw new Error('The shared document format does not match its filename')
  validateSource(format, envelope.source)
  return { filename: envelope.filename, source: envelope.source }
}
