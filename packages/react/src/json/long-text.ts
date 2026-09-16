import type { JsonViewSchemaDescriptor } from '@script-it/json-views-core'

/** Presentation only: never changes the stored value or inferred data type. */
export function isLongText(value: unknown, descriptor?: JsonViewSchemaDescriptor): value is string {
  return typeof value === 'string'
    && (!descriptor || descriptor.type === 'text' || descriptor.type === 'body' || descriptor.type === 'markdown' || descriptor.type === 'html')
    && (descriptor?.multiline === true || descriptor?.type === 'body' || descriptor?.type === 'markdown' || descriptor?.type === 'html' || value.length > 120 || /[\r\n]/.test(value))
}
