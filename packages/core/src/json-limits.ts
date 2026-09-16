/** Maximum number of nested object/array containers supported by structured views. */
export const MAX_JSON_DEPTH = 512
export class JsonDepthLimitError extends RangeError {
  readonly code = 'json-depth-limit'
  constructor() {
    super(`This document exceeds the supported nesting limit of ${MAX_JSON_DEPTH} containers. Its original JSON source is preserved; reduce nesting to use structured views.`)
    this.name = 'JsonDepthLimitError'
  }
}

/** Iterative guard for callers supplying already-parsed data. Cycles also fail boundedly. */
export function assertJsonDepth(root: unknown): void {
  const pending = [{ value: root, depth: 0 }]
  while (pending.length) {
    const { value, depth } = pending.pop()!
    if (value === null || typeof value !== 'object') continue
    if (depth >= MAX_JSON_DEPTH) throw new JsonDepthLimitError()
    for (const key of Object.keys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (descriptor && 'value' in descriptor) pending.push({ value: descriptor.value, depth: depth + 1 })
    }
  }
}
