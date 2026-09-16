export type AtomicValue = string | number | boolean

/** Values whose editor type is unambiguous from the source value itself. */
export function isEditableAtomicValue(value: unknown): value is AtomicValue {
  return typeof value === 'string'
    || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value))
}
