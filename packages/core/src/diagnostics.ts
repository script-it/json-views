import { MAX_JSON_DEPTH } from './json-limits.js'
import { describeValuePath, getValueAtPath, VALUE_PATH_MISSING, type ValuePath } from './json-path.js'
import type { CompiledJsonViewSchema, JsonViewMetadataDiagnostic, JsonViewSchemaDescriptor } from './metadata.js'
import { JSON_VIEW_OPTION_COLORS, type JsonViewTypeRegistry } from './type-registry.js'
import { ANNOTATION_PROPERTIES, COMMON_FILTER_OPERATORS, VIEW_PROPERTIES, type JsonViewDiagnosticHelp } from './annotation-capabilities.js'

export type { JsonViewDiagnosticHelp } from './annotation-capabilities.js'

/** Do not echo entire records or long strings into every diagnostic. */
export function diagnosticValuePreview(value: unknown, depth = 0): string {
  if (value === VALUE_PATH_MISSING || value === undefined) return 'missing'
  if (value === null) return 'null'
  if (typeof value === 'string') return JSON.stringify(value.length > 160 ? `${value.slice(0, 157)}…` : value)
  if (Array.isArray(value)) return depth > 0 ? `array (${value.length} items)`
    : `[${value.slice(0, 3).map((item) => diagnosticValuePreview(item, depth + 1)).join(', ')}${value.length > 3 ? ', …' : ''}]`
  if (typeof value === 'object') {
    const keys = Object.keys(value)
    return `object {${keys.slice(0, 5).map((key) => diagnosticValuePreview(key)).join(', ')}${keys.length > 5 ? ', …' : ''}}`
  }
  return String(value)
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function propertyHelp(property: string, type: string): JsonViewDiagnosticHelp | undefined {
  switch (property) {
    case 'title': case 'description':
      return { fix: `Set ${property} to a JSON string or remove it.`, expected: 'string', examples: ['Customer name'], capabilities: [property === 'title' ? 'Descriptor title labels a field. The first configured view column identifies records.' : 'Description documents the field; it does not validate or transform its value.'] }
    case 'required': case 'nullable':
      return { fix: 'Use required: true to reject empty values; omit required or set it to false for optional fields. Remove nullable.', expected: 'boolean required; no nullable property', examples: [{ type, required: true }], capabilities: ['Optional fields allow missing values and null. Empty strings are optional except for date, where an empty string is invalid.', 'required does not enforce a nonempty collection; multi-select accepts [] even when required is true.'] }
    case 'minimum': case 'maximum':
      return type === 'date'
        ? { fix: `Set ${property} to a valid date string; remove it or use null for no bound.`, expected: 'YYYY-MM-DD or a timestamp with seconds', examples: ['2026-01-01', '2026-01-01T09:30:00Z'], capabilities: ['Date-only bounds compare the written calendar day; timestamp bounds compare the reference timeline. minimum must not be after maximum when they have comparable kinds.'] }
        : { fix: `Set ${property} to an unquoted finite number or remove it.`, expected: 'finite JSON number', examples: [0, 100], capabilities: ['Numeric bounds are inclusive. Built-in bounds apply to number and date, not text length or collection size.'] }
    case 'defaultIncludeTime':
      return { fix: 'Set defaultIncludeTime to true or false, or remove it.', expected: 'boolean', examples: [true], capabilities: ['For date editors only: chooses whether a new empty date starts with time enabled. It does not require times, add a default value, or convert existing dates.'] }
    case 'pattern':
      return { fix: 'Use an RE2 pattern string of at most 4,096 UTF-16 code units. Replace lookarounds and backreferences with supported syntax.', expected: 'RE2 pattern string', examples: ['^[A-Z][0-9]+$'], capabilities: ['Searches strings for a match; add ^ and $ to constrain the whole string.', 'This is a JSON string, so backslashes must be JSON-escaped. Patterns do not validate array elements or non-string values.'] }
    case 'options':
      return { fix: 'Set options to an array of strings on a select or multi-select descriptor.', expected: 'string[]', examples: [['Todo', 'Done']], capabilities: ['Choices are open: options are suggestions, and observed values are appended. Options do not enforce a closed enum.', 'select stores one string; multi-select stores an array of strings. Use a custom validator for a closed enum.'] }
    case 'optionColors':
      return { fix: 'Use an object mapping option strings to built-in palette names on select or multi-select.', expected: 'Record<option, palette color>', allowedValues: JSON_VIEW_OPTION_COLORS, examples: [{ Todo: 'blue', Done: 'green' }], capabilities: ['Keys are option values, not array indices. Hex colors, CSS color names outside the palette, and label/value option objects are unsupported.'] }
    case 'placeholder':
      return { fix: 'Set placeholder to a string or remove it.', expected: 'string', examples: ['Enter a name'], capabilities: ['Built-in text, Markdown, and date editors use placeholder. It is an input hint, not a default data value.'] }
    case 'multiline':
      return { fix: 'Set multiline to true or false on a text descriptor.', expected: 'boolean', examples: [{ type: 'text', multiline: true }], capabilities: ['Changes the text editor to multiple lines. Long text can use a multiline editor and full-width record presentation.'] }
    case 'step':
      return { fix: 'Set step to a positive finite number on a number descriptor.', expected: 'number greater than 0', examples: [0.5, 1], capabilities: ['An editor increment only; step does not enforce integer values or divisibility. Use a custom validator for those constraints.'] }
    default: return undefined
  }
}

const VALUE_SHAPES: Record<string, { expected: string; examples: unknown[]; capabilities?: string[] }> = {
  text: { expected: 'JSON string', examples: ['Example'] },
  markdown: { expected: 'JSON string containing Markdown', examples: ['## Notes\nRecord details'], capabilities: ['Renders Markdown and supported HTML; editing preserves source text. Multiple properties may use Markdown.'] },
  body: { expected: 'JSON string containing the record body', examples: ['## Notes\nRecord details'], capabilities: ['Legacy body annotations are normalized to Markdown.'] },
  number: { expected: 'finite JSON number, not a quoted number', examples: [0, 1, 0.5] },
  checkbox: { expected: 'JSON boolean true or false, not a string or 0/1', examples: [true, false] },
  select: { expected: 'one JSON string', examples: ['Todo'], capabilities: ['options are suggestions, not a closed enum; new strings are valid.'] },
  'multi-select': { expected: 'JSON array of strings', examples: [[], ['Todo']], capabilities: ['options are suggestions, not a closed enum. [] is valid even with required: true.'] },
  date: { expected: 'real calendar date YYYY-MM-DD, or YYYY-MM-DDTHH:mm:ss with optional fractional seconds and optional Z/±HH:mm', examples: ['2026-01-01', '2026-01-01T09:30:00Z'], capabilities: ['Seconds are required in timestamps. Empty strings, Unix numbers, impossible dates, leap seconds, and 24:00:00 are invalid.', 'An absent offset is a floating time, not the machine timezone. Add Z or an explicit offset only if the intended timezone is known.'] },
  url: { expected: 'absolute http:// or https:// URL string', examples: ['https://example.com'] },
  email: { expected: 'email string containing a local part, @, and a domain with a dot', examples: ['name@example.com'] },
}

function valueHelp(item: JsonViewMetadataDiagnostic, descriptor: JsonViewSchemaDescriptor, registry: JsonViewTypeRegistry, entry?: CompiledJsonViewSchema): JsonViewDiagnosticHelp {
  const type = descriptor.type
  if (/^(Validation failed:|Validator must return|Warning provider failed:|Warning provider must return)/.test(item.message)) {
    const hook = item.code === 'typed-value-warning' ? 'warnings' : 'validate'
    return {
      fix: `Correct the ${hook} hook in the host registration for ${JSON.stringify(type)}: ${item.message} Changing the data may not fix a failing hook.`,
      expected: hook === 'warnings' ? 'warnings returns an array of strings without throwing' : 'validate returns a diagnostic string or undefined without throwing',
      capabilities: ['Custom hooks are host application code; annotations cannot repair their implementation.'],
    }
  }
  const shape = (registry.get(type)?.descriptorProperties && Object.hasOwn(VALUE_SHAPES, type) ? VALUE_SHAPES[type] : undefined) ?? { expected: `a value accepted by registered type ${JSON.stringify(type)}`, examples: [] }
  const capabilities = [...(shape.capabilities ?? [])]
  if (descriptor.required) capabilities.push('required: true rejects missing and null values, and empty strings. Populate the data; change required only if the field is intended to be optional.')
  else capabilities.push(`The field is optional: missing and null are allowed${type === 'date' ? '; use null instead of an empty string' : ', as is an empty string'}.`)
  for (const key of ['minimum', 'maximum', 'pattern'] as const) {
    if (descriptor[key] !== undefined) capabilities.push(`Active ${key}: ${diagnosticValuePreview(descriptor[key])}.`)
  }
  if (descriptor.pattern !== undefined) capabilities.push('pattern searches strings; ^ and $ anchor the whole string. It does not test individual array elements.')
  if (item.code === 'required-value-missing' && entry && (item.sourcePath?.length ?? 0) < entry.path.segments.length) {
    return {
      fix: `Restore the missing object or collection ancestors at ${describeValuePath(item.sourcePath ?? [])}, then populate the required fields matching ${JSON.stringify(entry.declaration)}. Do not replace the container with a leaf value.`,
      expected: `object/collection ancestors leading to ${shape.expected} at ${entry.declaration}`,
      capabilities: [...capabilities, 'This sourcePath is the unresolved ancestor, not the leaf. An existing empty collection has no required child instances; required does not enforce collection size.'],
    }
  }
  const candidates = [descriptor.minimum, descriptor.maximum, ...(descriptor.options?.slice(0, 2) ?? []), ...shape.examples]
    .filter((value) => value !== undefined && value !== null)
  const examples = candidates.filter((value) => !registry.validate(value, descriptor)).slice(0, 3)
  return {
    fix: item.code === 'typed-value-warning'
      ? `Review ${describeValuePath(item.sourcePath ?? [])}: ${item.message} Preserve the intended value when resolving this warning.`
      : `Set ${describeValuePath(item.sourcePath ?? [])} to ${shape.expected}. If the annotation describes the wrong data, correct ${describeValuePath(item.metadataPath)} instead.`,
    expected: `${shape.expected}, satisfying the active descriptor constraints`,
    ...(examples.length ? { examples } : {}), capabilities,
  }
}

function helpFor(item: JsonViewMetadataDiagnostic, metadata: unknown, registry: JsonViewTypeRegistry, descriptors: ReadonlyMap<string, CompiledJsonViewSchema>): JsonViewDiagnosticHelp {
  const raw = (path: ValuePath) => getValueAtPath(metadata, path.slice(1))
  const declaration = record(raw(item.metadataPath.slice(0, 3)))
  const descriptor = declaration as unknown as JsonViewSchemaDescriptor
  const property = String(item.metadataPath.at(-1))
  const view = record(raw(item.metadataPath.slice(0, 3)))
  const viewPath = typeof view.path === 'string' ? view.path : '$.rows'
  const fieldPath = `${viewPath}[*].field`
  if (item.scope === 'value') return valueHelp(item, descriptors.get(item.declaration ?? '')?.descriptor ?? descriptor, registry, descriptors.get(item.declaration ?? ''))
  if (item.code === 'unknown-schema-type' || item.code === 'invalid-schema-type') return {
    fix: 'Set type to a name registered in this host. Register a custom type and its editor in the host before using a new name.',
    expected: 'nonempty registered type name', allowedValues: registry.names(), examples: [{ type: 'text' }],
    capabilities: ['JSON Views types describe editors and validation. JSON Schema names such as string, boolean, integer, array, and object are not built-in type names. Use text, checkbox, number, or multi-select as appropriate.'],
  }
  if (item.code === 'unknown-schema-property' || item.code === 'inapplicable-schema-property') {
    const supported = registry.get(descriptor.type)?.descriptorProperties ?? []
    const detail = propertyHelp(property, descriptor.type)
    return { fix: `Remove or correct ${JSON.stringify(property)}; it has no built-in effect for ${JSON.stringify(descriptor.type)}. Keep it only if a host extension consumes it.`, expected: `supported properties for ${descriptor.type}`, allowedValues: supported, capabilities: detail ? [detail.fix, ...(detail.capabilities ?? [])] : ['Unknown descriptor fields are preserved for host extensions. JSON Schema keywords such as enum, default, format, minLength, items, and properties do not implement validation here.'] }
  }
  if (item.code === 'unknown-annotation-property' || item.code === 'unknown-view-property') {
    const parent = item.metadataPath.at(-2)
    const ancestor = item.metadataPath.at(-3)
    const allowed = item.scope === 'metadata' ? ANNOTATION_PROPERTIES
      : parent === 'filter' ? ['match', 'rules']
      : ancestor === 'rules' ? ['path', 'operator', 'value']
      : ancestor === 'columns' ? ['label', 'path']
      : ancestor === 'sort' ? ['path', 'direction'] : VIEW_PROPERTIES
    return { fix: `Remove or rename ${JSON.stringify(property)} to a supported property. Keep it only if a host extension consumes it.`, expected: 'a supported property at this location', allowedValues: allowed, capabilities: ['Unknown fields are retained in source but ignored by the built-in compiler.'] }
  }
  if (item.scope === 'schema' && item.metadataPath.length >= 4) {
    const detail = propertyHelp(item.code === 'invalid-option-color' ? 'optionColors' : property, descriptor.type)
    if (detail) return detail
  }
  if (item.code.endsWith('-path')) return {
    fix: item.code === 'invalid-schema-path' ? 'Rename this schema map key to a supported absolute path.'
      : item.code === 'invalid-view-path' || item.code === 'unresolved-view-path' ? 'Set view.path to an existing concrete location in the document; select the collection itself for a record view.'
      : `Set this field path to ${fieldPath}, replacing field with an existing record property.`,
    expected: item.code === 'invalid-schema-path' ? 'absolute JSONPath; [*] may match array items or dictionary values'
      : item.code === 'invalid-view-path' || item.code === 'unresolved-view-path' ? 'absolute JSONPath with no wildcard'
      : `the view path ${viewPath}, followed by exactly one [*], then a nonempty concrete field path`,
    examples: item.code === 'invalid-schema-path' ? ['$.rows[*].name', "$['key with spaces']"]
      : item.code === 'invalid-view-path' || item.code === 'unresolved-view-path' ? ['$', '$.rows'] : [fieldPath, `${viewPath}[*].profile.email`],
    capabilities: ['All paths start at $. Supported segments: .key, [\'quoted key\'], [0], [*]. No @ relative paths, recursive descent, slices, unions, or filter expressions.', 'Record field paths must resolve on at least one current row; empty collections are allowed. Nested wildcards after the record selector are unsupported.'],
  }
  switch (item.code) {
    case 'invalid-metadata': case 'unsupported-metadata-version':
      return { fix: item.code === 'unsupported-metadata-version' ? 'Use a host that supports this version, or deliberately translate the annotations to version 1. Do not merely relabel future metadata.' : 'Set annotations to an object containing numeric version: 1.', expected: '{ version: 1, schema?: object, views?: array }', examples: [{ version: 1 }], capabilities: ['schema maps absolute data paths to descriptors; it is not JSON Schema. Existing invalid annotations suppress inference.'] }
    case 'invalid-schema-map': case 'invalid-schema-descriptor':
      return { fix: item.code === 'invalid-schema-map' ? 'Replace schema with an object whose keys are absolute data paths and values are descriptor objects.' : 'Replace this descriptor with an object containing type.', expected: item.code === 'invalid-schema-map' ? 'Record<absolute path, descriptor>' : '{ type: registered type, ...properties }', examples: item.code === 'invalid-schema-map' ? [{ '$.rows[*].name': { type: 'text' } }] : [{ type: 'text' }] }
    case 'invalid-number-bounds': case 'invalid-date-bounds':
      return { fix: 'Correct minimum or maximum so minimum does not exceed maximum, or remove the unintended bound.', expected: 'ordered inclusive bounds', capabilities: ['Both conflicting bounds are omitted from the compiled descriptor until repaired.'] }
    case 'invalid-type-descriptor':
      if (/^Descriptor validator (failed:|must return)/.test(item.message)) return { fix: `Correct the validateDescriptor hook in the host registration for ${JSON.stringify(descriptor.type)}: ${item.message}`, expected: 'validateDescriptor returns a diagnostic string or undefined without throwing', capabilities: ['The descriptor is excluded while the host hook fails.'] }
      return { fix: `Correct this ${JSON.stringify(descriptor.type)} descriptor according to its registered validator: ${item.message}`, expected: 'a descriptor accepted by the host type validator', capabilities: ['This descriptor is excluded until its custom validation succeeds. Extension-specific requirements come from the host registration.'] }
    case 'schema-specificity-conflict':
      return { fix: 'Remove the duplicate/conflicting declaration, make the descriptors identical, or make the intended override more specific with a concrete key/index.', expected: 'one unambiguous winning descriptor per data location', capabilities: ['More concrete segments win, then longer paths, then the earlier declaration. Equally specific conflicting declarations do not merge.'] }

    case 'invalid-views': case 'invalid-view':
      return { fix: item.code === 'invalid-views' ? 'Set views to an array of view objects.' : 'Provide a view object with a nonempty name and a concrete absolute path.', expected: 'view object with name and path; optional id, display, columns, filter, sort, groupBy, groupOrder, orderPath', examples: item.code === 'invalid-views' ? [[{ name: 'Rows', path: '$.rows' }]] : [{ name: 'Rows', path: '$.rows' }] }
    case 'invalid-view-id': case 'duplicate-view-id':
      return { fix: 'Use a unique nonempty string id, or omit id to let the compiler assign one.', expected: 'unique string id', capabilities: ['A missing id is generated. Duplicate ids receive a numeric suffix; references should use the resulting compiled id.'] }
    case 'invalid-columns': case 'invalid-column':
      if (property === 'label') return { fix: 'Set label to a nonempty display string; keep the field selector in path.', expected: 'nonempty string label', examples: ['Name'], capabilities: ['Column labels do not rename source properties and need not be unique.'] }
      return { fix: 'Set columns to an array of objects, each with a nonempty label and an absolute record field path.', expected: '{ label: string, path: absolute field path }[]', examples: [[{ label: 'Name', path: `${viewPath}[*].name` }]], capabilities: ['Omit columns or use [] to infer columns. Labels may repeat; paths select data without renaming source properties.'] }
    case 'invalid-filter':
      if (property === 'match') return { fix: 'Set match to all or any, or remove match to use all.', expected: '"all" or "any"', allowedValues: ['all', 'any'], capabilities: ['all requires every rule; any requires at least one. Empty rules leave all rows visible.'] }
      if (property === 'rules') return { fix: 'Set rules to an array of rule objects, or remove filter.', expected: '{ path, operator, value? }[]', examples: [[{ path: fieldPath, operator: 'isNotEmpty' }]], capabilities: ['An empty rules array leaves all rows visible.'] }
      return { fix: 'Provide filter.rules as an array and set match to all or any, or omit match.', expected: '{ match?: "all" | "any", rules: rule[] }', examples: [{ match: 'all', rules: [{ path: fieldPath, operator: 'eq', value: 'Todo' }] }], capabilities: ['all requires every rule; any requires at least one. Empty rules leave all rows visible.'] }
    case 'invalid-filter-rule': case 'invalid-filter-operator':
      return { fix: 'Set operator to one supported by every applicable field type. Custom operators require a registered type with a filterOperators allowlist and matchesFilter implementation.', expected: 'supported operator string', allowedValues: COMMON_FILTER_OPERATORS, capabilities: ['date only supports eq, neq, gt, gte, lt, lte, isEmpty, isNotEmpty.', 'All non-presence operators require value; in and notIn require an array.'] }
    case 'invalid-filter-value': {
      const rule = record(raw(item.metadataPath.slice(0, -1)))
      const array = rule.operator === 'in' || rule.operator === 'notIn'
      return { fix: `Set value to ${array ? 'an array of comparison values' : 'a comparison value matching the field type'}.`, expected: array ? 'JSON array' : 'JSON value appropriate for the operator and field type', examples: array ? [['Todo', 'Done']] : ['Todo'], capabilities: ['isEmpty and isNotEmpty do not use value. For date comparisons use a valid date or timestamp string; date-only operands compare the written calendar day.'] }
    }
    case 'unused-filter-value':
      return { fix: 'Remove value from this presence rule.', expected: 'isEmpty/isNotEmpty with path and operator only', capabilities: ['Presence operators ignore comparison values. Common presence considers missing, null, empty strings, and empty arrays empty; date presence considers only missing and null empty.'] }
    case 'invalid-sort': case 'invalid-sort-entry':
      if (property === 'direction') return { fix: 'Set direction to asc or desc.', expected: '"asc" or "desc"', allowedValues: ['asc', 'desc'], capabilities: ['asc sorts ascending; desc sorts descending. Missing/null values remain last.'] }
      return { fix: 'Set sort to an array with an absolute field path and direction asc or desc on every entry.', expected: '{ path: absolute field path, direction: "asc" | "desc" }[]', examples: [[{ path: fieldPath, direction: 'asc' }]], capabilities: ['Earlier entries have higher priority. Missing/null sort last in either direction, and source order breaks ties.'] }
    case 'invalid-html':
      return { fix: 'Set html to a non-empty HTML string with explicit closing tags for jv-field/jv-value.', expected: 'non-empty html string', examples: ['<h1><jv-field bind="$.name"></jv-field></h1>'] }
    case 'invalid-html-css':
      return { fix: 'Set css to a string or omit it.', expected: 'optional CSS string' }
    case 'html-size-limit':
      return { fix: 'Reduce this template string to at most 256 KiB UTF-8.', expected: 'HTML and CSS at most 256 KiB each' }
    case 'incompatible-html':
      return { fix: 'Use display: "html" for html/css and remove columns, filter, sort, groupBy, groupOrder and orderPath from HTML views.', expected: '{ name, path, display: "html", html, css? }' }
    case 'removed-view-title':
      return { fix: 'Remove title from the view and put the identifying field first in columns.', expected: 'columns: [{ label, path }, ...]', capabilities: ['The first configured column supplies table record links and Kanban headings. Schema title remains a field label.'] }
    case 'invalid-display':
      return { fix: 'Remove display for automatic rendering, or choose kanban for a grouped collection or html with embedded HTML/CSS.', expected: 'omitted display, "kanban", or "html"', allowedValues: ['kanban', 'html'], capabilities: ['table, list, grid, and adaptive are not valid explicit display values. Tables and other default layouts are chosen from the data shape when display is omitted.'] }
    case 'invalid-group-order':
      return { fix: 'Set groupOrder to an array of unique scalar lane values, or remove it to use schema and data order.', expected: 'array of strings, finite numbers, booleans, or null', examples: [['Todo', 'In progress', 'Done']], capabilities: ['Only Kanban views use groupOrder. Values not currently present remain available as empty lanes.'] }
    case 'incompatible-view':
      return { fix: 'Point path at an array of objects or a dictionary of object records, or remove collection-only columns, filter, sort, groupBy, groupOrder, and orderPath.', expected: 'record collection for collection field configuration', capabilities: ['Mixed arrays and arrays of primitives are not record collections. Raw data remains available when a view is excluded.'] }
    case 'incompatible-kanban':
      return { fix: `For a board, set display: "kanban", select a record collection, and set groupBy to ${viewPath}[*].status. Otherwise remove groupBy, groupOrder, and orderPath.`, expected: 'kanban display + record collection + groupBy field path', examples: [{ name: 'Board', path: '$.rows', display: 'kanban', groupBy: '$.rows[*].status' }], capabilities: ['groupBy selects lanes. groupOrder controls lane order. orderPath optionally controls card ordering and must be a different finite numeric field on every record.'] }
    case 'conflicting-kanban-paths': case 'invalid-order-value':
      return { fix: item.code === 'conflicting-kanban-paths' ? 'Choose a separate numeric field for orderPath, or remove orderPath.' : `Populate ${describeValuePath(item.sourcePath ?? [])} and the corresponding order field on every record with finite numbers, or remove orderPath.`, expected: 'a finite numeric ordering field, distinct from groupBy, on every record', examples: [{ position: 1 }, { position: 2 }], capabilities: ['Numeric strings and missing ranks are invalid. Equal ranks retain stable source order.'] }
    default:
      return { fix: `Correct the value at ${describeValuePath(item.metadataPath)}: ${item.message}`, expected: item.message }
  }
}

export function explainMetadataDiagnostics(
  diagnostics: readonly JsonViewMetadataDiagnostic[], root: unknown, metadata: unknown,
  registry: JsonViewTypeRegistry, metadataSource: 'embedded' | 'external' | 'inferred',
  schema: readonly CompiledJsonViewSchema[] = [],
): JsonViewMetadataDiagnostic[] {
  const descriptors = new Map(schema.map((entry) => [entry.declaration, entry]))
  return diagnostics.map((item) => {
    const target = (item.scope === 'value' || item.code === 'invalid-order-value') && item.sourcePath ? getValueAtPath(root, item.sourcePath)
      : getValueAtPath(metadata, item.metadataPath.slice(1))
    return { ...item, metadataSource, help: { ...helpFor(item, metadata, registry, descriptors), received: diagnosticValuePreview(target), ...item.help } }
  })
}

export function sourceDiagnosticHelp(code: string): JsonViewDiagnosticHelp {
  switch (code) {
    case 'json-depth-limit': return { fix: 'Reduce nesting to use structured views. The original source remains available for editing and download.', expected: `at most ${MAX_JSON_DEPTH} nested object/array containers`, capabilities: ['This is a structured-view resource limit, not a JSON syntax error.'] }
    case 'duplicate-key': return { fix: 'Edit the exact source to rename or remove duplicate properties after deciding which data to retain. Do not repair by parsing and reserializing the document.', expected: 'unique property names within each object', capabilities: ['Structured inspection shows only the last occurrence. Source preserves all occurrences; editing an ambiguous path or ancestor is restricted. start/end identify a duplicate source span.'] }
    case 'unsafe-number': return { fix: 'Read and edit the exact numeric token in Source. If this is an identifier or exact decimal, consider a string and update its descriptor to text.', expected: 'an intentionally preserved exact token, or a value safe for JavaScript numeric editing', capabilities: ['Do not round-trip this token through JSON.parse/JSON.stringify or a parsed-value update. Use exact source text.', 'Unsafe integers, overflow, underflow, negative zero, and decimal precision changes restrict structured edits.'] }
    case 'missing-header': return { fix: 'Add a nonempty name for every CSV header column.', expected: 'one header row with nonempty, unique column names', examples: ['name,status\nAda,Todo\n'] }
    case 'duplicate-header': return { fix: 'Rename the repeated CSV header so every column has a unique name.', expected: 'unique CSV column names' }
    case 'irregular-row': return { fix: 'Add missing cells or remove extra cells so this record has the same cell count as the header.', expected: 'one cell per header column', capabilities: ['Quote cells containing delimiters or line breaks; escape a quote inside a quoted cell as two quotes.'] }
    case 'bare-cr': return { fix: 'Replace bare carriage-return line endings with LF or CRLF.', expected: 'LF or CRLF line endings' }
    case 'unterminated-quote': case 'invalid-quoted-cell': case 'invalid-quote': case 'invalid-csv':
      return { fix: 'Repair CSV quoting at the reported source location: close quoted fields and double embedded quotes.', expected: 'CSV with balanced double quotes and consistent columns', examples: ['name,note\nAda,"Said ""hello"""\n'] }
    default: return { fix: 'Repair the JSON syntax in the exact source, then validate again. Use double-quoted keys/strings; remove comments and trailing commas.', expected: 'one valid JSON value', examples: ['{"rows":[]}'], capabilities: ['Syntax errors prevent annotation and value validation. Once parsing succeeds, diagnostics reveal the next relevant issues.'] }
  }
}
