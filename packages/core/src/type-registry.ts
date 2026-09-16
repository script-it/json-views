import {
  DATE_FILTER_OPERATORS,
  compareDateValues,
  dateValueWarnings,
  matchesDateFilter,
  validateDateValue,
  type DateTypeDescriptor,
} from './date-type.js'

import { compileSafePattern } from './safe-pattern.js'
import { BUILT_IN_DESCRIPTOR_PROPERTIES, COMMON_DESCRIPTOR_PROPERTIES } from './annotation-capabilities.js'
export const BUILT_IN_TYPE_NAMES = [
  'text',
  'markdown',
  'html',
  'number',
  'checkbox',
  'select',
  'multi-select',
  'date',
  'url',
  'email',
  'body',
] as const

export type BuiltInTypeName = (typeof BUILT_IN_TYPE_NAMES)[number]

/** Stable palette names understood by the built-in choice widgets. */
export const JSON_VIEW_OPTION_COLORS = [
  'gray', 'blue', 'green', 'yellow', 'orange', 'red', 'purple', 'pink',
] as const

export type JsonViewOptionColor = (typeof JSON_VIEW_OPTION_COLORS)[number]

export interface JsonViewTypeDescriptorLike {
  type: string
  required?: boolean
  minimum?: number | string | null
  maximum?: number | string | null
  pattern?: string
  options?: string[]
  optionColors?: Record<string, JsonViewOptionColor>
  [key: string]: unknown
}

export interface JsonViewTypeDefinition<Descriptor extends JsonViewTypeDescriptorLike = JsonViewTypeDescriptorLike> {
  name: string
  validate: (value: unknown, descriptor: Descriptor) => string | undefined
  warnings?: (value: unknown, descriptor: Descriptor) => string[]
  /** Checks type-specific annotation fields before the descriptor can be used. */
  validateDescriptor?: (descriptor: Descriptor) => string | undefined
  /** Converts persisted JSON to the editor model. Omitted hooks are identity. */
  parse?: (value: unknown, descriptor: Descriptor) => unknown
  /** Converts an editor model to JSON, before canonical value validation. */
  serialize?: (value: unknown, descriptor: Descriptor) => unknown
  compare?: (left: unknown, right: unknown, direction: 'asc' | 'desc') => number
  matchesFilter?: (value: unknown, operator: string, expected: unknown) => boolean | undefined
  filterOperators?: readonly string[]
  /** Supported annotation keys for diagnostic help. Omit for an open extension vocabulary. */
  descriptorProperties?: readonly string[]
}

function requireString(value: unknown): string | undefined {
  return typeof value === 'string' ? undefined : 'Value must be text'
}

export class JsonViewTypeRegistry {
  private readonly definitions = new Map<string, JsonViewTypeDefinition>()
  private readonly listeners = new Set<() => void>()
  private revision = 0

  get version(): number { return this.revision }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private changed(): void {
    this.revision += 1
    this.listeners.forEach((listener) => listener())
  }

  constructor(definitions: readonly JsonViewTypeDefinition[] = []) {
    definitions.forEach((definition) => this.register(definition))
  }

  register(definition: JsonViewTypeDefinition): this {
    if (typeof definition.name !== 'string' || !definition.name.trim()) throw new TypeError('A JSON Views type must have a name')
    if (typeof definition.validate !== 'function') throw new TypeError('A JSON Views type must provide validate')
    if (definition.filterOperators?.some((operator) => typeof operator !== 'string' || !operator.trim())) {
      throw new TypeError('Filter operators must be non-empty strings')
    }
    this.definitions.set(definition.name, Object.freeze({
      ...definition,
      ...(definition.filterOperators ? { filterOperators: Object.freeze([...definition.filterOperators]) } : {}),
      ...(definition.descriptorProperties ? { descriptorProperties: Object.freeze([...definition.descriptorProperties]) } : {}),
    }))
    this.changed()
    return this
  }

  unregister(name: string): this {
    if (this.definitions.delete(name)) this.changed()
    return this
  }

  get(name: string): JsonViewTypeDefinition | undefined {
    return this.definitions.get(name)
  }

  has(name: string): boolean {
    return this.definitions.has(name)
  }

  names(): string[] {
    return [...this.definitions.keys()]
  }

  clone(): JsonViewTypeRegistry {
    return new JsonViewTypeRegistry([...this.definitions.values()])
  }

  validateDescriptor(descriptor: JsonViewTypeDescriptorLike): string | undefined {
    try {
      const issue: unknown = this.get(descriptor.type)?.validateDescriptor?.(descriptor)
      return issue === undefined || typeof issue === 'string' ? issue : 'Descriptor validator must return a string or undefined'
    } catch (error) {
      return `Descriptor validator failed: ${error instanceof Error ? error.message : String(error)}`
    }
  }

  parse(value: unknown, descriptor: JsonViewTypeDescriptorLike): unknown {
    const parse = this.get(descriptor.type)?.parse
    return parse ? parse(value, descriptor) : value
  }

  serialize(value: unknown, descriptor: JsonViewTypeDescriptorLike): unknown {
    const serialize = this.get(descriptor.type)?.serialize
    return serialize ? serialize(value, descriptor) : value
  }

  validate(value: unknown, descriptor: JsonViewTypeDescriptorLike): string | undefined {
    if (value === undefined || value === null || (value === '' && descriptor.type !== 'date')) {
      return descriptor.required === true ? 'A value is required' : undefined
    }
    const definition = this.get(descriptor.type)
    if (!definition) return `Unknown type: ${descriptor.type}`
    try {
      const issue: unknown = definition.validate(value, descriptor)
      if (issue !== undefined && typeof issue !== 'string') return 'Validator must return a string or undefined'
      if (issue) return issue
      if (typeof value === 'string' && descriptor.pattern !== undefined) {
        if (!compileSafePattern(descriptor.pattern).matcher(value).find()) return 'Value does not match the required pattern'
      }
    } catch (error) {
      return `Validation failed: ${error instanceof Error ? error.message : String(error)}`
    }
    return undefined
  }

  warnings(value: unknown, descriptor: JsonViewTypeDescriptorLike): string[] {
    try {
      const warnings: unknown = this.get(descriptor.type)?.warnings?.(value, descriptor) ?? []
      return Array.isArray(warnings) && warnings.every((warning) => typeof warning === 'string')
        ? warnings : ['Warning provider must return an array of strings']
    } catch (error) {
      return [`Warning provider failed: ${error instanceof Error ? error.message : String(error)}`]
    }
  }

  compare(left: unknown, right: unknown, descriptor: JsonViewTypeDescriptorLike, direction: 'asc' | 'desc'): number | undefined {
    try {
      const result = this.get(descriptor.type)?.compare?.(left, right, direction)
      return typeof result === 'number' && Number.isFinite(result) ? result : undefined
    } catch { return undefined }
  }

  matchesFilter(value: unknown, operator: string, expected: unknown, descriptor: JsonViewTypeDescriptorLike): boolean | undefined {
    try {
      const matches: unknown = this.get(descriptor.type)?.matchesFilter?.(value, operator, expected)
      return matches === undefined || typeof matches === 'boolean' ? matches : false
    } catch { return false }
  }

  filterOperators(descriptor: JsonViewTypeDescriptorLike): readonly string[] | undefined {
    return this.get(descriptor.type)?.filterOperators
  }
}

const textType: JsonViewTypeDefinition = { name: 'text', validate: requireString, serialize: (value) => value == null ? value : String(value) }
const markdownType: JsonViewTypeDefinition = { ...textType, name: 'markdown' }
const htmlType: JsonViewTypeDefinition = { ...textType, name: 'html' }
const bodyType: JsonViewTypeDefinition = { ...textType, name: 'body' }
const numberType: JsonViewTypeDefinition = {
  name: 'number',
  serialize: (value) => typeof value === 'string' ? value.trim() === '' ? null : Number(value) : value,
  validate(value, descriptor) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 'Value must be a finite number'
    if (typeof descriptor.minimum === 'number' && value < descriptor.minimum) return `Value must be at least ${descriptor.minimum}`
    if (typeof descriptor.maximum === 'number' && value > descriptor.maximum) return `Value must be at most ${descriptor.maximum}`
    return undefined
  },
}
const checkboxType: JsonViewTypeDefinition = {
  name: 'checkbox',
  serialize(value) {
    if (value === true || value === 'true') return true
    if (value === false || value === 'false') return false
    return value
  },
  validate: (value) => typeof value === 'boolean' ? undefined : 'Value must be true or false',
}
const selectType: JsonViewTypeDefinition = {
  name: 'select',
  serialize: (value) => value === '' ? null : value,
  validate(value) {
    return typeof value === 'string' ? undefined : 'Value must be text'
  },
}
const multiSelectType: JsonViewTypeDefinition = {
  name: 'multi-select',
  serialize: (value) => typeof value === 'string' ? JSON.parse(value) : value,
  validate(value) {
    if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
      return 'Value must be an array of text options'
    }
    return undefined
  },
}
export const dateTypeDefinition: JsonViewTypeDefinition = {
  name: 'date',
  validate: (value, descriptor) => validateDateValue(value, descriptor as unknown as DateTypeDescriptor),
  warnings: dateValueWarnings,
  compare: compareDateValues,
  matchesFilter: matchesDateFilter,
  filterOperators: DATE_FILTER_OPERATORS,
}
const urlType: JsonViewTypeDefinition = {
  name: 'url',
  serialize: textType.serialize,
  validate(value) {
    if (typeof value !== 'string') return 'Value must be a URL'
    try {
      const url = new URL(value)
      return url.protocol === 'http:' || url.protocol === 'https:' ? undefined : 'Enter a valid web URL'
    } catch {
      return 'Enter a valid web URL'
    }
  },
}
const emailType: JsonViewTypeDefinition = {
  name: 'email',
  serialize: textType.serialize,
  validate: (value) => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    ? undefined
    : 'Enter a valid email address',
}

export function createDefaultTypeRegistry(): JsonViewTypeRegistry {
  return new JsonViewTypeRegistry([
    textType,
    numberType,
    checkboxType,
    selectType,
    multiSelectType,
    dateTypeDefinition,
    urlType,
    emailType,
    markdownType,
    htmlType,
    bodyType,
  ].map((definition) => ({
    ...definition,
    descriptorProperties: [...COMMON_DESCRIPTOR_PROPERTIES, ...BUILT_IN_DESCRIPTOR_PROPERTIES[definition.name]],
  })))
}

export const defaultTypeRegistry = createDefaultTypeRegistry()
