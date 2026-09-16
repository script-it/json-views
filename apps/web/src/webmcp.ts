import { JsonPatchError, type JsonPatchOperation } from '@script-it/json-views-core'
import {
  jsonPatchDiagnostic, JsonViewsPatchValidationError, JsonViewsSourceValidationError,
  type JsonValue, type JsonViewsConsoleApi,
} from './console-api.js'

interface WebMcpTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  execute(input: Record<string, unknown>): unknown | Promise<unknown>
}

interface WebMcpModelContext {
  registerTool(tool: WebMcpTool, options?: { signal?: AbortSignal }): void | Promise<void>
}

type WebMcpDocument = Document & { modelContext?: WebMcpModelContext }

const emptyInputSchema = {
  type: 'object',
  properties: {},
  additionalProperties: false,
} as const

const listInputSchema = {
  type: 'object',
  properties: {
    includeDiagnosticCount: {
      type: 'boolean',
      default: false,
      description: 'Include a diagnosticCount for each document. This inspects every open document.',
    },
  },
  additionalProperties: false,
} as const

const documentReferenceSchema = {
  type: 'string',
  description: 'Stable document id from json_views_list_documents, or a unique filename or relative folder path.',
} as const

const validationGuidance = ' valid covers source syntax only; always inspect diagnostics for annotation and value errors.'

function validationFailure(error: unknown): unknown {
  if (error instanceof JsonViewsSourceValidationError) {
    return { ok: false, saved: false, diagnosticTarget: 'submitted-source', diagnostics: error.diagnostics }
  }
  if (error instanceof JsonViewsPatchValidationError) {
    return { ok: false, saved: false, diagnosticTarget: 'submitted-patch', diagnostics: error.diagnostics }
  }
  throw error
}

function requiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key]
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${key} must be a non-empty string`)
  return value
}

function requiredJson(input: Record<string, unknown>, key: string): JsonValue {
  const value = input[key]
  if (value === undefined) throw new Error(`${key} is required`)
  JSON.stringify(value)
  return value as JsonValue
}

function requiredPatch(input: Record<string, unknown>): readonly JsonPatchOperation[] {
  if (!Array.isArray(input.patch)) {
    throw new JsonViewsPatchValidationError([jsonPatchDiagnostic(new JsonPatchError('invalid-patch', 'JSON Patch must be an array'))])
  }
  return input.patch as JsonPatchOperation[]
}

export function registerJsonViewsWebMcp(api: JsonViewsConsoleApi): () => void {
  const modelContext = (document as WebMcpDocument).modelContext
  if (!modelContext?.registerTool) return () => undefined

  const controller = new AbortController()
  const tools: WebMcpTool[] = [
    {
      name: 'json_views_help',
      description: 'Read the JSON Views agent reference: workspace operations, storage, $jsonviews schema, field types, paths, tables, pages, Kanban, filters, sorting, and a complete example. Read this to learn how to create or edit schemas and views.',
      inputSchema: emptyInputSchema,
      execute: () => api.help(),
    },
    {
      name: 'json_views_list_documents',
      description: 'List the JSON documents open in JSON Views. Returns stable ids, filenames, active state, source validity, and storage type. Optionally includes diagnostic counts. Call this first to identify a document.',
      inputSchema: listInputSchema,
      execute: (input) => api.list({ includeDiagnosticCount: input.includeDiagnosticCount === true }),
    },
    {
      name: 'json_views_get_link',
      description: 'Get a URL opening a file and optional exact view name, without navigating. Return the link to the user. Browser files must exist in their workspace; this is not a data-sharing link. Omit viewName to open the file root.',
      inputSchema: {
        type: 'object',
        properties: {
          document: documentReferenceSchema,
          viewName: { type: 'string', description: 'Exact, case-sensitive view name, unique within the file.' },
        },
        required: ['document'],
        additionalProperties: false,
      },
      execute: (input) => api.link(requiredString(input, 'document'), input.viewName === undefined ? undefined : requiredString(input, 'viewName')),
    },
    {
      name: 'json_views_get_document',
      description: 'Read an open JSON document. Parsed JSON is returned by default; request source to preserve its exact whitespace and numeric spelling.',
      inputSchema: {
        type: 'object',
        properties: {
          document: documentReferenceSchema,
          format: { type: 'string', enum: ['json', 'source'], default: 'json' },
        },
        required: ['document'],
        additionalProperties: false,
      },
      execute: (input) => input.format === 'source'
        ? api.source(requiredString(input, 'document'))
        : api.get(requiredString(input, 'document')),
    },
    {
      name: 'json_views_get_diagnostics',
      description: 'Inspect an open document without changing it. Returns source, annotation, view, and value diagnostics with exact paths and repair help: expected shapes, examples, allowed values, and relevant capabilities. Fix the reported issues, then inspect again.',
      inputSchema: {
        type: 'object',
        properties: { document: documentReferenceSchema },
        required: ['document'],
        additionalProperties: false,
      },
      execute: (input) => api.diagnostics(requiredString(input, 'document')),
    },
    {
      name: 'json_views_create_document',
      description: 'Create and select a browser-cached JSON document in the open JSON Views workspace. Returns document info with structured validation diagnostics.' + validationGuidance,
      inputSchema: {
        type: 'object',
        properties: {
          filename: { type: 'string', minLength: 1, description: 'Filename for the new document, normally ending in .json.' },
          value: { description: 'Any valid JSON value for the new document.' },
        },
        required: ['filename', 'value'],
        additionalProperties: false,
      },
      execute: (input) => api.create(requiredString(input, 'filename'), requiredJson(input, 'value')),
    },
    {
      name: 'json_views_patch_document',
      description: 'Apply an RFC 6902 JSON Patch to an open document. Operations run atomically in order and use RFC 6901 JSON Pointer paths. Returns document info with diagnostics; an invalid patch returns {ok:false, saved:false, diagnostics} and leaves the document unchanged.' + validationGuidance,
      inputSchema: {
        type: 'object',
        properties: {
          document: documentReferenceSchema,
          patch: {
            type: 'array',
            description: 'RFC 6902 operations. Use test to guard assumptions and path "" to address the document root.',
            items: {
              type: 'object',
              properties: {
                op: { type: 'string', enum: ['add', 'remove', 'replace', 'move', 'copy', 'test'] },
                path: { type: 'string', description: 'RFC 6901 JSON Pointer.' },
                from: { type: 'string', description: 'Source JSON Pointer for move or copy.' },
                value: { description: 'JSON value for add, replace, or test.' },
              },
              required: ['op', 'path'],
            },
          },
        },
        required: ['document', 'patch'],
        additionalProperties: false,
      },
      execute: (input) => api.patch(requiredString(input, 'document'), requiredPatch(input)),
    },
    {
      name: 'json_views_set_source',
      description: 'Replace an open document with exact source text. Any text is saved; malformed JSON returns document info with valid:false and diagnostics, and structured operations remain unavailable until repaired.' + validationGuidance,
      inputSchema: {
        type: 'object',
        properties: {
          document: documentReferenceSchema,
          source: { type: 'string', description: 'Complete source text; it may be temporarily invalid JSON.' },
        },
        required: ['document', 'source'],
        additionalProperties: false,
      },
      execute: (input) => {
        if (typeof input.source !== 'string') throw new Error('source must be a string containing the complete JSON source')
        return api.setSource(requiredString(input, 'document'), input.source)
      },
    },
    {
      name: 'json_views_select_document',
      description: 'Select an open JSON document so it becomes visible in the JSON Views interface.',
      inputSchema: {
        type: 'object',
        properties: { document: documentReferenceSchema },
        required: ['document'],
        additionalProperties: false,
      },
      execute: (input) => api.select(requiredString(input, 'document')),
    },
    {
      name: 'json_views_delete_document',
      description: 'Delete an open document from the JSON Views workspace. For a browser document this also removes it from the cached workspace.',
      inputSchema: {
        type: 'object',
        properties: { document: documentReferenceSchema },
        required: ['document'],
        additionalProperties: false,
      },
      execute: (input) => {
        const document = requiredString(input, 'document')
        api.remove(document)
        return { deleted: document }
      },
    },
  ]

  for (const tool of tools) {
    try {
      void Promise.resolve(modelContext.registerTool({
        ...tool,
        execute: (input) => {
          try {
            const result = tool.execute(input)
            return result instanceof Promise ? result.catch(validationFailure) : result
          } catch (error) {
            return validationFailure(error)
          }
        },
      }, { signal: controller.signal })).catch(() => undefined)
    } catch {
      // A partial or disabled WebMCP implementation must not prevent the editor from loading.
    }
  }

  return () => controller.abort()
}
