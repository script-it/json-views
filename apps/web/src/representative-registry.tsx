import { createDefaultTypeRegistry } from '@script-it/json-views-core'
import { createDefaultWidgetRegistry, type JsonViewDisplayWidgetProps, type JsonViewEditWidgetProps } from '@script-it/json-views-react'

export const exampleTypes = createDefaultTypeRegistry().register({
  name: 'base64-image',
  validate: (value) => typeof value === 'string' && value.startsWith('iVBORw0KGgo') && /^[A-Za-z0-9+/]+={0,2}$/.test(value)
    ? undefined : 'Expected a base64-encoded PNG image',
})

function Base64ImageDisplay({ value }: JsonViewDisplayWidgetProps) {
  if (typeof value !== 'string' || !value.startsWith('iVBORw0KGgo')) return <span>Invalid PNG</span>
  return <img className="representative-image" src={`data:image/png;base64,${value}`} alt="Chart embedded in this JSON document" loading="lazy" />
}

function Base64ImageEditor(props: JsonViewEditWidgetProps) {
  return <textarea
    aria-label={`Edit ${props.label}`}
    className="representative-image-editor"
    value={props.stringValue}
    disabled={props.disabled}
    onChange={(event) => props.onChange(event.target.value)}
    onBlur={() => props.onCommit()}
  />
}

export const exampleWidgets = createDefaultWidgetRegistry().register('base64-image', {
  display: Base64ImageDisplay,
  editor: Base64ImageEditor,
})
