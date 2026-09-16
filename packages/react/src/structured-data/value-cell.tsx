import { Maximize2, Table2 } from 'lucide-react'
import type { ValuePath } from '@script-it/json-views-core'
import { JsonSourceNumber, useJsonSourceLiterals } from '../json/source-literals.js'
import { formatAbsoluteTimestamp, formatRelativeTimeShortIfPast, parseIsoDateString } from '../lib/time.js'
import { StructuredValueCellFrame } from './atomic-value-editor.js'
import { OptionPill } from '../primitives/option-pill.js'

function isSimpleList(value: unknown): value is (string | number | boolean | null)[] {
  return Array.isArray(value) && value.every((item) => item === null || ['string', 'number', 'boolean'].includes(typeof item))
}

function isWebUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch { return false }
}

function getValuePreview(value: object, sourcePath: ValuePath | undefined, sourceLiteral: (path?: ValuePath) => string | undefined, depth = 0): string {
  const entries = Array.isArray(value)
    ? value.map((item, index) => [index, item] as const)
    : Object.entries(value)
  if (entries.length === 0) return '(empty)'

  const limit = depth === 0 ? 8 : 2
  const parts = entries.slice(0, limit).map(([key, item]) => {
    const path = sourcePath ? [...sourcePath, key] : undefined
    const literal = sourceLiteral(path)
    const text = item === null ? 'null' : typeof item === 'object'
      ? depth < 1 ? getValuePreview(item, path, sourceLiteral, depth + 1) : '…'
      : literal ?? String(item)
    return Array.isArray(value) ? text : `${key}: ${text}`
  })
  return parts.join(', ') + (entries.length > limit ? ', …' : '')
}

export function ExpandValueButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-transparent text-muted-foreground opacity-100 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/structured-cell:opacity-100 [@media(hover:hover)]:group-focus-within/structured-cell:opacity-100"
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      title="Expand value"
    >
      <Maximize2 className="h-3.5 w-3.5" />
    </button>
  )
}

export function ValueCell({
  value,
  sourcePath,
  onOpen,
}: {
  value: unknown
  sourcePath?: ValuePath
  onOpen: () => void
}) {
  const container = value !== null && typeof value === 'object' && !isSimpleList(value)
  return (
    <StructuredValueCellFrame
      actions={container ? undefined : <ExpandValueButton onClick={onOpen} />}
      activationLabel={container ? 'Open nested value' : undefined}
      onActivate={container ? onOpen : undefined}
    >
      <ValueCellContent containerInteractive={!container} sourcePath={sourcePath} value={value} onOpen={onOpen} />
    </StructuredValueCellFrame>
  )
}

export function ValueCellContent({
  containerInteractive = true,
  value,
  sourcePath,
  onOpen,
}: {
  containerInteractive?: boolean
  value: unknown
  sourcePath?: ValuePath
  onOpen: () => void
}) {
  const sourceLiteral = useJsonSourceLiterals()
  const literal = sourceLiteral(sourcePath)
  if (literal !== undefined) return <JsonSourceNumber literal={literal} />
  if (isSimpleList(value)) {
    if (value.every((item) => typeof item === 'string' && item.length <= 60 && !isWebUrl(item))) {
      const visible = value.slice(0, 8)
      return <span className="flex min-w-0 flex-1 flex-wrap gap-1 py-0.5">
        {visible.length === 0 ? <span className="text-muted-foreground">(empty)</span> : visible.map((item, index) => <OptionPill key={index} label={item} className="max-w-full" labelClassName="truncate" />)}
        {value.length > visible.length && <button type="button" className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground" onClick={(event) => { event.stopPropagation(); onOpen() }}>+{value.length - visible.length} more</button>}
      </span>
    }
    return <span className="min-w-0 flex-1 whitespace-normal break-words leading-5">
      {value.length === 0 ? '(empty)' : value.map((item, index) => {
        const itemLiteral = sourceLiteral(sourcePath ? [...sourcePath, index] : undefined)
        return <span key={index}>
          {index > 0 && ', '}
          {itemLiteral !== undefined ? <JsonSourceNumber literal={itemLiteral} /> : isWebUrl(item)
            ? <a href={item} target="_blank" rel="noopener noreferrer" className="text-link hover:underline" onClick={(event) => event.stopPropagation()}>{item}</a>
            : String(item)}
        </span>
      })}
    </span>
  }
  const isObject = value !== null && typeof value === 'object'

  if (!isObject) {
    const scalarValue = String(value ?? '')
    // An ISO datetime string reads as a local date-time ("Jul 5, 2026,
    // 1:05 PM · 2h ago"); the raw value stays on the tooltip and in the
    // expanded view, so nothing is lost for copying. The relative suffix
    // only appears for past times — "ago" phrasing makes no sense for a
    // future timestamp.
    const isoMs = parseIsoDateString(value)
    const relative = isoMs !== null ? formatRelativeTimeShortIfPast(isoMs) : null
    return (
      <div
        className="min-w-0 flex-1 overflow-hidden whitespace-nowrap leading-[max(1.25rem,1.4em)] text-foreground"
        title={scalarValue}
      >
        {isoMs !== null ? (
          <>
            {formatAbsoluteTimestamp(isoMs)}
            {relative !== null && (
              <span className="text-muted-foreground"> · {relative}</span>
            )}
          </>
        ) : (
          scalarValue
        )}
      </div>
    )
  }

  const preview = getValuePreview(value, sourcePath, sourceLiteral)
  const displayText = preview

  const content = (
    <>
      <Table2 aria-hidden className="h-4 w-4 shrink-0 text-source-number" />
      <span className="min-w-0 truncate underline">{displayText}</span>
    </>
  )
  return containerInteractive ? (
    <button type="button" className="inline-flex min-h-7 max-w-full min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-1 text-left leading-5 transition-colors hover:bg-accent" onClick={onOpen} title={preview}>
      {content}
    </button>
  ) : (
    <span className="inline-flex min-h-7 max-w-full min-w-0 flex-1 items-center gap-2 px-1 leading-5" title={preview}>{content}</span>
  )
}
