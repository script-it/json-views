import { parseJsonViewPath, resolveJsonViewPath } from './metadata.js'
import type { ValuePath } from './json-path.js'

export { MAX_HTML_VIEW_BYTES } from './html-view-limits.js'
export function resolveHtmlViewBinding(root: unknown, expression: string, aliases: Readonly<Record<string, ValuePath>>, scope: ValuePath) {
  const match = /^([A-Za-z_][A-Za-z0-9_]*)(.*)$/.exec(expression)
  const prefix = expression.startsWith('$') ? [] : match && Object.prototype.hasOwnProperty.call(aliases, match[1]) ? aliases[match[1]] : undefined
  if (!prefix) throw new Error(`Unknown binding: ${expression}`)
  const parsed = parseJsonViewPath(expression.startsWith('$') ? expression : `$${match![2]}`, { allowWildcard: false })
  const relative = parsed.segments.map(segment => {
    if (segment.kind === 'wildcard') throw new Error('Single bindings cannot contain wildcards')
    return segment.kind === 'property' ? segment.key : segment.index
  })
  const path = [...prefix, ...relative]
  if (path.includes('$jsonviews') || !scope.every((part, index) => path[index] === part) || path.length < scope.length) throw new Error(`Binding outside the view data scope: ${expression}`)
  const absolute = parseJsonViewPath('$' + path.map(part => typeof part === 'number' ? `[${part}]` : `['${part.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}']`).join(''))
  return resolveJsonViewPath(root, absolute)
}
export function htmlRepeatKeys(items: readonly unknown[], key?: string): string[] {
  if (!key) return items.map((_, i) => `index:${i}`)
  const keys = items.map(item => {
    const value = item && typeof item === 'object' && Object.prototype.hasOwnProperty.call(item, key) ? (item as Record<string, unknown>)[key] : undefined
    if (typeof value !== 'string' && !(typeof value === 'number' && Number.isFinite(value))) throw new Error(`Repeat key ${key} must be a string or finite number on every item`)
    return `${typeof value}:${value}`
  })
  if (new Set(keys).size !== keys.length) throw new Error(`Repeat key ${key} must be unique`)
  return keys
}
