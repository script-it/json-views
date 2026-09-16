export type ValuePathSegment = string | number
export type ValuePath = readonly ValuePathSegment[]

export const VALUE_PATH_MISSING = Symbol('value-path-missing')

export function describeValuePath(path: ValuePath): string {
  if (path.length === 0) return '<root>'
  return path
    .map((segment) => typeof segment === 'number' ? `[${segment}]` : `[${JSON.stringify(segment)}]`)
    .join('')
}

/** Resolves an existing typed path or explains why it is invalid. */
export function requireValueAtPath(
  root: unknown,
  path: ValuePath,
): unknown {
  let current = root
  for (let index = 0; index < path.length; index++) {
    const segment = path[index]

    if (Array.isArray(current)) {
      if (typeof segment !== 'number' || !Number.isInteger(segment) || segment < 0) {
        throw new TypeError(`JSON array path segment at index ${index} must be a non-negative integer`)
      }
      if (segment >= current.length || !Object.prototype.hasOwnProperty.call(current, segment)) {
        throw new RangeError(`JSON path ${describeValuePath(path)} does not exist`)
      }
      current = current[segment]
      continue
    }

    if (current !== null && typeof current === 'object') {
      if (typeof segment !== 'string') {
        throw new TypeError(`JSON object path segment at index ${index} must be a string`)
      }
      if (!Object.prototype.hasOwnProperty.call(current, segment)) {
        throw new RangeError(`JSON path ${describeValuePath(path)} does not exist`)
      }
      current = (current as Record<string, unknown>)[segment]
      continue
    }

    throw new TypeError(`JSON path ${describeValuePath(path.slice(0, index))} is not a container`)
  }
  return current
}

/** Resolves typed segments without conflating array indices and object keys. */
export function getValueAtPath(
  root: unknown,
  path: ValuePath,
): unknown | typeof VALUE_PATH_MISSING {
  try {
    return requireValueAtPath(root, path)
  } catch {
    return VALUE_PATH_MISSING
  }
}

/** Stable key for view state associated with an exact JSON path. */
export function valuePathKey(path: ValuePath): string {
  return JSON.stringify(path)
}

/** Creates nested JSON data properties without following inherited objects or setters.
 * Array writes may replace an existing item or append one item; sparse arrays are rejected.
 */
export function setJsonValueAtPath(root: object, path: ValuePath, value: unknown): void {
  if (path.length === 0) throw new TypeError('A property path is required')
  let current: object = root
  for (let index = 0; index < path.length; index += 1) {
    const segment = path[index]
    if (Array.isArray(current)) {
      if (typeof segment !== 'number' || !Number.isSafeInteger(segment) || segment < 0 || segment > current.length) {
        throw new TypeError('Array writes require an existing index or the next consecutive index')
      }
    } else if (typeof segment !== 'string') {
      throw new TypeError('Object writes require a string property')
    }
    if (index === path.length - 1) {
      Object.defineProperty(current, segment, { value, enumerable: true, writable: true, configurable: true })
      return
    }
    const descriptor = Object.getOwnPropertyDescriptor(current, segment)
    const child: unknown = descriptor && 'value' in descriptor ? descriptor.value : undefined
    const needsArray = typeof path[index + 1] === 'number'
    if (child !== null && typeof child === 'object' && Array.isArray(child) === needsArray) {
      current = child
    } else {
      const next: object = needsArray ? [] : Object.create(null)
      Object.defineProperty(current, segment, { value: next, enumerable: true, writable: true, configurable: true })
      current = next
    }
  }
}
