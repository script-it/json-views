import { RE2JS } from 're2js'

const MAX_PATTERN_LENGTH = 4096
const MAX_CACHED_PATTERNS = 128
const patterns = new Map<string, RE2JS>()

/** RE2 syntax provides linear-time matching; unsupported constructs fail compilation.
 * Pattern size and cache count also bound compilation input and retained programs.
 */
export function compileSafePattern(source: string): RE2JS {
  if (typeof source !== 'string' || source.length > MAX_PATTERN_LENGTH) {
    throw new TypeError(`pattern must be a string of at most ${MAX_PATTERN_LENGTH} characters`)
  }
  const existing = patterns.get(source)
  if (existing) return existing
  const compiled = RE2JS.compile(source)
  if (patterns.size >= MAX_CACHED_PATTERNS) patterns.delete(patterns.keys().next().value!)
  patterns.set(source, compiled)
  return compiled
}
