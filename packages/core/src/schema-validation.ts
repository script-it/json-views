import type { JsonViewSchemaDescriptor } from './metadata.js'
import { defaultTypeRegistry, type JsonViewTypeRegistry } from './type-registry.js'

export function validateJsonViewSchemaValue(
  value: unknown,
  descriptor: JsonViewSchemaDescriptor,
  typeRegistry: JsonViewTypeRegistry = defaultTypeRegistry,
): string | undefined {
  return typeRegistry.validate(value, descriptor)
}
