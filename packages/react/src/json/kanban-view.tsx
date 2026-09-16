import { useJsonSourceLiterals } from './source-literals.js'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { File, FileText, GripVertical } from 'lucide-react'
import { useJsonViewsRegistries } from '../widget-registry.js'
import { cn } from '../lib/cn.js'
import type { UiSize } from '../lib/ui-size.js'
import { type ValuePath } from '@script-it/json-views-core'
import { JSON_VIEW_PATH_MISSING, resolveJsonViewRowPath, schemaForJsonViewPath, type CompiledJsonViewMetadata, type CompiledJsonViewView, type JsonViewViewRow } from '@script-it/json-views-core'
import { JsonViewSchemaValueCell, type JsonViewSchemaExternalWidgetRenderer } from './schema-value.js'
import type { JsonValueReplacement } from '@script-it/json-views-core'
import { applyJsonViewViewRows, projectJsonViewCollection } from '@script-it/json-views-core'
import { GeneralJsonView } from './viewers/general/general-json-view.js'
import { OptionPill, optionColorsForValues } from '../primitives/option-pill.js'
import { type JsonViewJsonEditing, type JsonViewerProps } from './view-types.js'
import { matchesSearch, inferredDescriptor, rowHasLongText, titleForRow, titleFieldForRow, rowAtSourcePath, sameJsonViewPath } from './view-model.js'
import { GeneralRecordView, RecordView } from './record-view.js'
import { useKanbanColumnDrag } from './use-kanban-column-drag.js'
import { useKanbanCardDrag } from './use-kanban-card-drag.js'

interface KanbanGroup {
  key: string
  label: string
  value: unknown
}

const KANBAN_GROUP_COLORS: Record<string, string> = {
  gray: 'border-border bg-muted/40',
  blue: 'border-border bg-muted/40',
  green: 'border-border bg-muted/40',
  yellow: 'border-border bg-muted/40',
  orange: 'border-border bg-muted/40',
  red: 'border-border bg-muted/40',
  purple: 'border-border bg-muted/40',
  pink: 'border-border bg-muted/40',
}

function kanbanGroup(value: unknown | typeof JSON_VIEW_PATH_MISSING): KanbanGroup {
  if (value === JSON_VIEW_PATH_MISSING || value == null || value === '') {
    return { key: 'empty', label: 'No value', value: '' }
  }
  return {
    key: `value:${typeof value}:${JSON.stringify(value)}`,
    label: String(value),
    value,
  }
}

function groupValues(
  compiled: CompiledJsonViewMetadata,
  view: CompiledJsonViewView,
  rows: JsonViewViewRow[],
): KanbanGroup[] {
  if (!view.groupBy) return []
  const samplePath = rows[0]
    ? resolveJsonViewRowPath(compiled.root, rows[0], view.groupBy).sourcePath
    : view.groupBy.segments.map((segment): string | number => {
        if (segment.kind === 'property') return segment.key
        if (segment.kind === 'index') return segment.index
        return 0
      })
  const configured = schemaForJsonViewPath(compiled.schema, samplePath)?.descriptor.options
  const values = new Map<string, KanbanGroup>()
  view.groupOrder?.forEach((item) => {
    const group = kanbanGroup(item)
    values.set(group.key, group)
  })
  if (Array.isArray(configured)) {
    configured.filter((item): item is string => typeof item === 'string').forEach((item) => {
      const group = kanbanGroup(item)
      values.set(group.key, group)
    })
  }
  for (const row of rows) {
    const value = resolveJsonViewRowPath(compiled.root, row, view.groupBy).value
    const group = kanbanGroup(value)
    values.set(group.key, group)
  }
  const positions = new Map(view.groupOrder?.map((value, index) => [kanbanGroup(value).key, index]))
  return Array.from(values.values()).sort((left, right) => {
    const leftPosition = positions.get(left.key)
    const rightPosition = positions.get(right.key)
    if (leftPosition !== undefined || rightPosition !== undefined) {
      return (leftPosition ?? Infinity) - (rightPosition ?? Infinity)
    }
    if (left.key === 'empty' || right.key === 'empty') return left.key === 'empty' ? 1 : -1
    if (typeof left.value === 'number' && typeof right.value === 'number') return left.value - right.value
    return left.label.localeCompare(right.label, undefined, { numeric: true, sensitivity: 'base' })
  })
}

function rowIdentity(row: JsonViewViewRow): string {
  return JSON.stringify(row.sourcePath)
}

function groupValueForRow(
  root: unknown,
  view: CompiledJsonViewView,
  row: JsonViewViewRow,
): KanbanGroup {
  if (!view.groupBy) return kanbanGroup(JSON_VIEW_PATH_MISSING)
  const value = resolveJsonViewRowPath(root, row, view.groupBy).value
  return kanbanGroup(value)
}

function orderRows(
  root: unknown,
  view: CompiledJsonViewView,
  rows: JsonViewViewRow[],
  temporaryOrder?: string[],
): JsonViewViewRow[] {
  if (view.orderPath) {
    return rows.map((row, index) => ({ row, index })).sort((left, right) => {
      const leftValue = resolveJsonViewRowPath(root, left.row, view.orderPath!).value
      const rightValue = resolveJsonViewRowPath(root, right.row, view.orderPath!).value
      if (typeof leftValue === 'number' && typeof rightValue === 'number') return leftValue - rightValue || left.index - right.index
      if (typeof leftValue === 'number') return -1
      if (typeof rightValue === 'number') return 1
      return left.index - right.index
    }).map(({ row }) => row)
  }
  if (!temporaryOrder) return rows
  const positions = new Map(temporaryOrder.map((id, index) => [id, index]))
  return rows.map((row, index) => ({ row, index })).sort((left, right) => (
    (positions.get(rowIdentity(left.row)) ?? Number.MAX_SAFE_INTEGER)
    - (positions.get(rowIdentity(right.row)) ?? Number.MAX_SAFE_INTEGER)
    || left.index - right.index
  )).map(({ row }) => row)
}

export function KanbanView({
  compiled,
  copyFileName,
  editing,
  filePath,
  fillHeight,
  query,
  onCurrentPathChange,
  onSaveView,
  rawView,
  renderExternalWidget,
  renderMarkdown,
  uiSize,
  view,
}: {
  compiled: CompiledJsonViewMetadata
  copyFileName: string
  editing?: JsonViewJsonEditing
  filePath?: string
  fillHeight: boolean
  query: string
  onCurrentPathChange?: JsonViewerProps['onCurrentPathChange']
  onSaveView?: (value: Record<string, unknown>) => Promise<void>
  rawView?: Record<string, unknown>
  renderExternalWidget?: JsonViewSchemaExternalWidgetRenderer
  renderMarkdown?: (content: string) => ReactNode
  uiSize?: UiSize
  view: CompiledJsonViewView
}) {
  const { types } = useJsonViewsRegistries()
  const sourceLiteral = useJsonSourceLiterals()
  const rowTitle = (row: JsonViewViewRow) => sourceLiteral(titleFieldForRow(compiled.root, view, row)?.path) ?? titleForRow(compiled.root, view, row)
  const [openRowPath, setOpenRowPath] = useState<ValuePath>()
  const [pendingGroups, setPendingGroups] = useState<KanbanGroup[]>()
  const savingGroups = useRef(false)
  const [dragError, setDragError] = useState<string>()
  const boardRef = useRef<HTMLDivElement>(null)
  const boardPosition = useRef({ left: 0, top: 0 })
  useEffect(() => {
    if (openRowPath) return
    const board = boardRef.current
    if (board) {
      board.scrollLeft = boardPosition.current.left
      board.scrollTop = boardPosition.current.top
    }
  }, [openRowPath])
  const [moveNotice, setMoveNotice] = useState('')
  const [temporaryOrder, setTemporaryOrder] = useState<Record<string, string[]>>({})
  const completeRows = useMemo(() => applyJsonViewViewRows(compiled.root, view, compiled.schema, types, sourceLiteral), [compiled.root, compiled.schema, view, types, types.version, sourceLiteral])
  const rows = useMemo(() => completeRows.filter((row) => matchesSearch(row.value, query)), [completeRows, query])
  const openRow = rowAtSourcePath(compiled.root, openRowPath)
  const reportedPath = openRow?.sourcePath ?? view.sourcePath
  const reportedPathKey = JSON.stringify(reportedPath)
  const savedGroups = useMemo(() => groupValues(compiled, view, completeRows), [compiled, view, completeRows])
  const groups = pendingGroups ?? savedGroups
  const hasGroupReordering = rawView !== undefined && onSaveView !== undefined && groups.length > 1
  const canReorderGroups = hasGroupReordering && !pendingGroups && !editing?.saving
  const moveGroup = async (sourceKey: string, targetKey: string, position: 'before' | 'after') => {
    if (!canReorderGroups || savingGroups.current || sourceKey === targetKey) return
    const ordered = [...groups]
    const sourceIndex = ordered.findIndex((group) => group.key === sourceKey)
    const targetIndex = ordered.findIndex((group) => group.key === targetKey)
    if (sourceIndex < 0 || targetIndex < 0) return
    const [moved] = ordered.splice(sourceIndex, 1)
    const updatedTargetIndex = ordered.findIndex((group) => group.key === targetKey)
    ordered.splice(updatedTargetIndex + (position === 'after' ? 1 : 0), 0, moved)
    if (ordered.every((group, index) => group.key === groups[index].key)) return
    setDragError(undefined)
    savingGroups.current = true
    setPendingGroups(ordered)
    try {
      await onSaveView({ ...rawView, groupOrder: ordered.map((group) => group.value) })
    } catch (error) {
      setDragError(error instanceof Error ? error.message : 'Could not reorder these columns')
    } finally {
      savingGroups.current = false
      setPendingGroups(undefined)
    }
  }
  const columnDrag = useKanbanColumnDrag({
    enabled: canReorderGroups && !openRow,
    scope: JSON.stringify([filePath, view.id, view.groupBy?.source, savedGroups.map(group => group.key)]),
    onMove: (source, target, position) => { void moveGroup(source, target, position) },
  })
  const projected = useMemo(() => projectJsonViewCollection(compiled.root, view, compiled.schema, types, sourceLiteral), [compiled, view, types, types.version, sourceLiteral])
  const cardFields = useMemo(() => projected.columns.filter((column) => {
    if (sameJsonViewPath(column.path, projected.columns[0]?.path) || sameJsonViewPath(column.path, view.groupBy)) return false
    return !projected.rows.some((row) => {
      const resolved = resolveJsonViewRowPath(compiled.root, row, column.path)
      if (resolved.value === JSON_VIEW_PATH_MISSING) return false
      const descriptor = schemaForJsonViewPath(compiled.schema, resolved.sourcePath)?.descriptor
      if (Array.isArray(resolved.value)) return descriptor?.type !== 'multi-select'
      return resolved.value !== null && typeof resolved.value === 'object'
    })
  }).slice(0, 3), [projected, compiled, view])
  const rowsByGroup = useMemo(() => {
    const buckets = new Map<string, JsonViewViewRow[]>()
    for (const row of rows) {
      const key = groupValueForRow(compiled.root, view, row).key
      const bucket = buckets.get(key)
      if (bucket) bucket.push(row)
      else buckets.set(key, [row])
    }
    for (const [key, bucket] of buckets) buckets.set(key, orderRows(compiled.root, view, bucket, temporaryOrder[key]))
    return buckets
  }, [compiled.root, view, rows, temporaryOrder])
  const sourcePaths = !openRow && view.groupBy && (view.filter?.rules.length || query.trim())
    ? groups.flatMap((group) => (rowsByGroup.get(group.key) ?? []).map((row) => row.sourcePath))
    : undefined
  const sourcePathsKey = JSON.stringify(sourcePaths)
  useEffect(() => {
    onCurrentPathChange?.(reportedPath, sourcePaths)
  }, [onCurrentPathChange, reportedPathKey, sourcePathsKey])
  const cardDrag = useKanbanCardDrag({
    boardRef: columnDrag.boardRef,
    enabled: !!editing && !editing.saving && !openRow,
    scope: JSON.stringify([filePath, view.id, view.groupBy?.source, groups.map(group => group.key), rows.map(row => [rowIdentity(row), row.value]), temporaryOrder]),
    onMove: (id, key, before) => {
      const row = completeRows.find(row => rowIdentity(row) === id)
      const group = groups.find(group => group.key === key)
      if (row && group) void place(row, group, completeRows.find(row => rowIdentity(row) === before))
    },
  })
  if (openRow) return <RecordView compiled={compiled} copyFileName={copyFileName} editing={editing} filePath={filePath} fillHeight={fillHeight} onBack={() => setOpenRowPath(undefined)} onCurrentPathChange={onCurrentPathChange} renderExternalWidget={renderExternalWidget} renderMarkdown={renderMarkdown} row={openRow} uiSize={uiSize} view={view} />
  if (!view.groupBy) return <GeneralJsonView root={compiled.root} initialPath={view.sourcePath} defaultKey={view.name} editing={editing} fillHeight={fillHeight} uiSize={uiSize} renderRecord={(target) => <GeneralRecordView {...target} compiled={compiled} copyFileName={copyFileName} editing={editing} filePath={filePath} fillHeight={fillHeight} name={view.name} onCurrentPathChange={onCurrentPathChange} renderExternalWidget={renderExternalWidget} renderMarkdown={renderMarkdown} uiSize={uiSize} />} />
  const place = async (row: JsonViewViewRow, group: KanbanGroup, beforeRow?: JsonViewViewRow) => {
    const resolved = resolveJsonViewRowPath(compiled.root, row, view.groupBy!)
    if (!editing || editing.saving || editing.canReplace?.(resolved.sourcePath) === false || resolved.value === JSON_VIEW_PATH_MISSING) return
    const currentGroup = groupValueForRow(compiled.root, view, row)
    const targetRows = orderRows(
      compiled.root,
      view,
      completeRows.filter((candidate) => groupValueForRow(compiled.root, view, candidate).key === group.key && rowIdentity(candidate) !== rowIdentity(row)),
      temporaryOrder[group.key],
    )
    const targetIndex = beforeRow ? targetRows.findIndex((candidate) => rowIdentity(candidate) === rowIdentity(beforeRow)) : -1
    const insertAt = targetIndex < 0 ? targetRows.length : targetIndex
    targetRows.splice(insertAt, 0, row)
    setDragError(undefined)
    try {
      setMoveNotice('')
      if (!view.orderPath) {
        // Keep the exact previewed slot even when a cross-column move only
        // persists the grouping field (there is no numeric orderPath).
        setTemporaryOrder((current) => ({ ...current, [group.key]: targetRows.map(rowIdentity) }))
        if (currentGroup.key === group.key) {
          setMoveNotice(`${rowTitle(row)} reordered in ${group.label}`)
          return
        }
        await editing.replace(resolved.sourcePath, group.value)
        setMoveNotice(`${rowTitle(row)} moved to ${group.label}`)
        return
      }

      const affectedGroups = currentGroup.key === group.key ? [targetRows] : [
        orderRows(
          compiled.root,
          view,
          completeRows.filter((candidate) => groupValueForRow(compiled.root, view, candidate).key === currentGroup.key && rowIdentity(candidate) !== rowIdentity(row)),
        ),
        targetRows,
      ]
      const replacements: JsonValueReplacement[] = []
      if (currentGroup.key !== group.key) replacements.push({ path: resolved.sourcePath, value: group.value })
      for (const groupRows of affectedGroups) {
        for (const [index, candidate] of groupRows.entries()) {
          const order = resolveJsonViewRowPath(compiled.root, candidate, view.orderPath)
          if (order.value === JSON_VIEW_PATH_MISSING || typeof order.value !== 'number') {
            throw new Error(`orderPath must point to an existing number on every card`)
          }
          if (order.value !== index) replacements.push({ path: order.sourcePath, value: index })
        }
      }
      if (replacements.some(({ path }) => editing.canReplace?.(path) === false)) throw new Error('One of the affected fields is read-only')
      if (replacements.length > 0) await editing.replaceMany(replacements)
      setMoveNotice(`${rowTitle(row)} moved in ${group.label}`)
    } catch (error) {
      setDragError(error instanceof Error ? error.message : 'Could not move this card')
    }
  }
  return (
    <div data-id="jsonView-kanban-layout" className={cn('min-w-0 max-w-full', fillHeight && 'flex min-h-0 flex-1 flex-col')}>
      <span role="status" className={moveNotice ? 'mb-2 text-xs text-muted-foreground' : 'sr-only'}>{moveNotice}</span>
      {dragError && <p role="alert" className="mb-2 rounded-md border border-destructive-border bg-destructive-surface px-3 py-2 text-xs text-destructive-foreground">{dragError}</p>}
      <div ref={(node) => { boardRef.current = node; columnDrag.boardRef.current = node }} data-id="jsonView-kanban"
        onScroll={() => {
          const board = boardRef.current
          if (!board) return
          boardPosition.current = { left: board.scrollLeft, top: board.scrollTop }
        }}
        onDragEnterCapture={event => { columnDrag.onDragEnterCapture(event); cardDrag.onDragEnterCapture(event) }}
        onDragOverCapture={event => { columnDrag.onDragOverCapture(event); cardDrag.onDragOverCapture(event) }}
        onDropCapture={event => { columnDrag.onDropCapture(event); cardDrag.onDropCapture(event) }}
        onDragLeave={event => { columnDrag.onDragLeave(event); cardDrag.onDragLeave(event) }}
        className={cn('min-w-0 max-w-full overflow-x-auto overscroll-x-contain', fillHeight && 'min-h-0 flex-1 overflow-y-auto')}>
        <div className="relative flex w-max min-w-full items-start gap-3 py-3 pr-3">
          <div ref={columnDrag.markerRef} data-id="jsonView-kanban-column-drop-indicator" hidden aria-hidden
            className="pointer-events-none absolute left-0 z-20 w-[3px] rounded-full bg-blue-500 ring-2 ring-background">
            <span className="absolute -left-[3px] -top-1 size-[9px] rounded-full bg-blue-500" />
            <span className="absolute -bottom-1 -left-[3px] size-[9px] rounded-full bg-blue-500" />
          </div>
          {groups.map((group) => {
            const groupDescriptor = schemaForJsonViewPath(compiled.schema, view.groupBy!.segments.map((segment): string | number => (
              segment.kind === 'property' ? segment.key : segment.kind === 'index' ? segment.index : 0
            )))?.descriptor
            const groupColors = optionColorsForValues([...(groupDescriptor?.options ?? []), ...groups.filter((entry) => entry.key !== 'empty').map((entry) => entry.label)], groupDescriptor?.optionColors)
            const groupColor = group.key === 'empty' ? 'gray' : groupColors[group.label]
            const grouped = rowsByGroup.get(group.key) ?? []
            return (
              <section
                key={group.key}
                data-id="jsonView-kanban-column"
                data-group-value={group.label}
                data-group-key={group.key}
                data-group-color={groupColor}
                className={cn(
                  'relative w-64 shrink-0 rounded-lg border p-2.5 transition-colors data-[column-dragging=true]:opacity-40',
                  KANBAN_GROUP_COLORS[groupColor],
                )}
              >
                <header
                  data-id="jsonView-kanban-column-header"
                  draggable={canReorderGroups}
                  className={cn('flex h-8 select-none items-center justify-between gap-2 px-1 text-xs font-medium', canReorderGroups && 'cursor-grab active:cursor-grabbing')}
                  onDragStart={(event) => columnDrag.start(event, group.key)}
                >
                  <div className="flex min-w-0 items-center gap-1">
                    {hasGroupReordering && (
                      <button
                        type="button"
                        data-id="jsonView-kanban-column-move"
                        draggable={canReorderGroups}
                        disabled={!canReorderGroups}
                        aria-label={`Reorder ${group.label} column`}
                        title="Drag or use arrow keys to reorder this column"
                        className="shrink-0 cursor-grab rounded-sm text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-50"
                        onKeyDown={(event) => {
                          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
                          event.preventDefault()
                          const offset = event.key === 'ArrowLeft' ? -1 : 1
                          const target = groups[groups.indexOf(group) + offset]
                          if (target) void moveGroup(group.key, target.key, event.key === 'ArrowLeft' ? 'before' : 'after')
                        }}
                      >
                        <GripVertical aria-hidden className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <OptionPill label={group.label} color={groupColor} className="min-w-0 max-w-[10rem]" labelClassName="truncate" />
                  </div>
                  <span className="font-mono text-muted-foreground">{grouped.length}</span>
                </header>
                <div data-id="jsonView-kanban-cards" className="grid gap-2.5 pt-1.5">
                  {grouped.length === 0 && <p className="px-2 py-5 text-center text-xs text-muted-foreground">{query ? 'No matching cards' : 'No cards'}</p>}
                  {grouped.map((row, rowIndex) => {
                    const groupPath = resolveJsonViewRowPath(compiled.root, row, view.groupBy!)
                    const canMove = editing !== undefined && editing.canReplace?.(groupPath.sourcePath) !== false && groupPath.value !== JSON_VIEW_PATH_MISSING
                    const hasLongText = rowHasLongText(compiled, row.sourcePath)
                    const PageIcon = hasLongText ? FileText : File
                    const rowId = rowIdentity(row)
                    return (
                      <article
                        key={JSON.stringify(row.sourcePath)}
                        data-id="jsonView-kanban-card"
                        data-row-id={rowId}
                        draggable={canMove && !editing.saving}
                        className="min-w-0 overflow-hidden rounded-md border border-border bg-card p-3 shadow-sm"
                        onDragStart={(event) => {
                          const target = event.target instanceof Element ? event.target : null
                          if (!canMove || (target?.closest('a, button, input, select, textarea, summary') && !target.closest('[data-id="jsonView-kanban-move"]'))) {
                            event.preventDefault()
                            return
                          }
                          cardDrag.start(event, rowId)
                        }}
                      >
                        <div className="flex min-w-0 items-start gap-1.5">
                          <button type="button" data-id="jsonView-kanban-move" draggable={canMove && !editing.saving} aria-label={`Reorder ${rowTitle(row)}`} title="Drag to move; use arrow keys when focused" disabled={!canMove || editing?.saving}
                            className="mt-0.5 shrink-0 cursor-grab rounded-sm text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-default"
                            onKeyDown={(event) => {
                              if (!canMove || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
                              event.preventDefault()
                              if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                                const target = groups[groups.indexOf(group) + (event.key === 'ArrowLeft' ? -1 : 1)]
                                if (target) void place(row, target)
                              } else if (event.key === 'ArrowUp' && rowIndex > 0) void place(row, group, grouped[rowIndex - 1])
                              else if (event.key === 'ArrowDown' && rowIndex < grouped.length - 1) void place(row, group, grouped[rowIndex + 2])
                            }}><GripVertical aria-hidden className="h-3.5 w-3.5" /></button>
                          <button type="button" className="min-w-0 flex-1 text-left text-xs font-medium leading-5 hover:underline" onClick={() => setOpenRowPath(row.sourcePath)}><span className="line-clamp-3">{rowTitle(row)}</span></button><PageIcon data-id="jsonView-row-page-icon" data-page-content={hasLongText ? 'text' : 'empty'} className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" /></div>
                        <div className="mt-2 grid gap-1.5 text-xs text-muted-foreground">
                          {cardFields.map((column) => {
                            const resolved = resolveJsonViewRowPath(compiled.root, row, column.path)
                            if (resolved.value === JSON_VIEW_PATH_MISSING) return null
                            const schema = schemaForJsonViewPath(compiled.schema, resolved.sourcePath)
                            const descriptor = schema?.descriptor ?? inferredDescriptor(resolved.value)
                            return (
                              <div key={column.id} className="min-w-0">
                                <JsonViewSchemaValueCell
                                  sourcePath={resolved.sourcePath}
                                  compact
                                  descriptor={descriptor}
                                  suppressRequiredValidation={editing?.isDraftRow?.(row.sourcePath) === true}
                                  onOptionColorChange={editing?.setOptionColor && schema ? (optionValue, color) => editing.setOptionColor!(schema.declaration, optionValue, color) : undefined}
                                  inputKey={String(resolved.sourcePath[resolved.sourcePath.length - 1] ?? column.label)}
                                  label={descriptor.title ?? column.label}
                                  value={resolved.value}
                                  onOpen={() => setOpenRowPath(row.sourcePath)}
                                  onClear={editing && resolved.value !== JSON_VIEW_PATH_MISSING ? () => editing.clear(resolved.sourcePath) : undefined}
                                  onCommit={editing && editing.canReplace?.(resolved.sourcePath) !== false && resolved.value !== JSON_VIEW_PATH_MISSING ? (next) => editing.replace(resolved.sourcePath, next) : undefined}
                                  renderExternalWidget={renderExternalWidget}
                                  renderMarkdown={renderMarkdown}
                                  saving={editing?.saving}
                                />
                              </div>
                            )
                          })}
                        </div>
                      </article>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
