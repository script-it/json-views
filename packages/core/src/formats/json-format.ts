import { assertJsonDepth } from '../json-limits.js'
import {
  appendJsonArrayItemInSource,
  inspectJsonSource,
  removeJsonValuesInSource,
  replaceJsonValueInSource,
  replaceJsonValuesInSource,
  stringifyJsonValue,
} from '../json-source-patcher.js'
import type { ValuePath } from '../json-path.js'
import type {
  DocumentDiagnostic,
  FormatCapability,
  StructuredDocumentAdapter,
  StructuredDocumentFormat,
  ValueReplacement,
} from './document-format.js'

export interface JsonDocumentState {
  root: unknown
}

function jsonCapability(value: unknown): FormatCapability {
  try {
    stringifyJsonValue(value)
    return { representable: true }
  } catch {
    return { representable: false, reason: 'The value is not losslessly representable as JSON data' }
  }
}

function adapter(format: Extract<StructuredDocumentFormat, 'json-object' | 'json-array'>): StructuredDocumentAdapter<JsonDocumentState> {
  return {
    format,
    inspect(source) {
      const inspected = inspectJsonSource(source)
      const actual = Array.isArray(inspected.value) ? 'json-array' : 'json-object'
      if (actual !== format) throw new TypeError(`Expected ${format === 'json-array' ? 'an array' : 'a non-array'} JSON root`)
      const diagnostics: DocumentDiagnostic[] = inspected.diagnostics.map((item) => ({
        code: item.code,
        message: item.message,
        severity: 'warning',
        path: item.sourcePath,
        start: item.start,
        end: item.end,
        help: item.help,
      }))
      return { root: inspected.value, state: { root: inspected.value }, diagnostics }
    },
    validate(source) { JSON.parse(source) },
    replace(source, _state, path, value) { return replaceJsonValueInSource(source, path, value) },
    replaceMany(source, _state, changes) {
      return replaceJsonValuesInSource(source, changes)
    },
    removeMany(source, _state, paths) {
      return removeJsonValuesInSource(source, paths)
    },
    append(source, _state, path, value) { return appendJsonArrayItemInSource(source, path, value) },
    canRepresent: jsonCapability,
  }
}

export const jsonObjectFormat = adapter('json-object')
export const jsonArrayFormat = adapter('json-array')

export function jsonFormatForSource(source: string): StructuredDocumentAdapter<JsonDocumentState> {
  return Array.isArray(JSON.parse(source)) ? jsonArrayFormat : jsonObjectFormat
}

export function jsonFormatForRoot(root: unknown): StructuredDocumentAdapter<JsonDocumentState> {
  return Array.isArray(root) ? jsonArrayFormat : jsonObjectFormat
}

/** Pretty-print JSON without changing numeric spelling, duplicate keys, or string contents. */
export function formatJsonSource(source: string): string {
  assertJsonDepth(JSON.parse(source))
  let formatted = ''
  let depth = 0
  let escaped = false
  let inString = false
  const expandedContainers: boolean[] = []
  const indentation = () => '  '.repeat(depth)

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    if (inString) {
      formatted += character
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') inString = false
      continue
    }
    if (/\s/.test(character)) continue
    if (character === '"') {
      inString = true
      formatted += character
      continue
    }
    if (character === '{' || character === '[') {
      const closingCharacter = character === '{' ? '}' : ']'
      let nextIndex = index + 1
      while (nextIndex < source.length && /\s/.test(source[nextIndex])) nextIndex += 1
      const expanded = source[nextIndex] !== closingCharacter
      expandedContainers.push(expanded)
      formatted += character
      if (expanded) {
        depth += 1
        formatted += `\n${indentation()}`
      }
      continue
    }
    if (character === '}' || character === ']') {
      const expanded = expandedContainers.pop() ?? false
      if (expanded) {
        depth -= 1
        formatted += `\n${indentation()}`
      }
      formatted += character
      continue
    }
    if (character === ',') {
      formatted += `,\n${indentation()}`
      continue
    }
    formatted += character === ':' ? ': ' : character
  }
  return formatted
}

export type { ValuePath, ValueReplacement }
