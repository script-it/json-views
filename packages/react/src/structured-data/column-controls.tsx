import { jsonValueText } from '@script-it/json-views-core'
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeftToLine, ArrowUpDown, ChevronDown, ChevronRight, ChevronUp, EyeOff, Filter, Plus, Trash2, X } from 'lucide-react'
import { useDismiss } from '../lib/use-dismiss.js'
import { useAnchoredPosition } from '../lib/use-anchored-position.js'
import { MenuSelect } from '../primitives/menu-select.js'
import { useJsonViewsPortalContainer } from '../surface.js'
import type { ColumnFilterOperatorOption, ColumnFilterRule, SortConfig, SortDirection, TabularObjectArrayViewProps } from './table-types.js'

const DEFAULT_FILTER_OPERATORS: readonly ColumnFilterOperatorOption[] = [
  { value: 'eq', label: 'is' },
  { value: 'neq', label: 'is not' },
  { value: 'in', label: 'is any of' },
  { value: 'notIn', label: 'is none of' },
  { value: 'gt', label: 'is greater than' },
  { value: 'gte', label: 'is at least' },
  { value: 'lt', label: 'is less than' },
  { value: 'lte', label: 'is at most' },
  { value: 'contains', label: 'contains' },
  { value: 'notContains', label: 'does not contain' },
  { value: 'isEmpty', label: 'is empty' },
  { value: 'isNotEmpty', label: 'is not empty' },
]

function filterValueText(value: unknown, operator?: string): string {
  if ((operator === 'in' || operator === 'notIn') && Array.isArray(value)) return value.map(jsonValueText).join(', ')
  if (typeof value === 'string') return value
  if (value === undefined) return ''
  try { return JSON.stringify(value) }
  catch { return jsonValueText(value) }
}

export function AddColumnHeader({ onAdd }: { onAdd: NonNullable<TabularObjectArrayViewProps['onAddColumn']> }) {
  const portalContainer = useJsonViewsPortalContainer()
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [type, setType] = useState<'text' | 'markdown' | 'html' | 'number' | 'checkbox' | 'date' | 'select' | 'multi-select'>('text')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLFormElement>(null)
  const position = useAnchoredPosition(open, triggerRef, dialogRef)

  const close = () => { if (!saving) { setOpen(false); setError(undefined) } }
  const show = () => {
    setOpen(true)
  }
  useDismiss({ enabled: open, onDismiss: close, insideRefs: [triggerRef, dialogRef] })

  return <>
    <button ref={triggerRef} type="button" data-id="tabular-add-column" className="flex h-full min-h-9 w-full items-center gap-1.5 px-3 py-2 text-left text-muted-foreground hover:bg-accent hover:text-foreground" onClick={show}>
      <Plus className="h-3.5 w-3.5" /> Add property
    </button>
    {open && typeof document !== 'undefined' && createPortal(
      <form ref={dialogRef} aria-label="Add property" className="z-[100] grid w-64 gap-3 rounded-md border border-border bg-card p-3 text-foreground shadow-lg" style={position} onSubmit={(event) => {
        event.preventDefault()
        const nextLabel = label.trim()
        if (!nextLabel) return
        setSaving(true)
        setError(undefined)
        void Promise.resolve(onAdd({ label: nextLabel, type })).then(() => {
          setLabel('')
          setType('text')
          setOpen(false)
        }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not add this property')).finally(() => setSaving(false))
      }}>
        <label className="grid gap-1 text-xs font-medium">Name<input autoFocus value={label} onChange={(event) => setLabel(event.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-sm font-normal outline-none focus-visible:ring-1 focus-visible:ring-ring" /></label>
        <label className="grid gap-1 text-xs font-medium">Type<MenuSelect
          ariaLabel="Property type"
          options={[
            { value: 'text', label: 'Text' },
            { value: 'markdown', label: 'Markdown' },
            { value: 'html', label: 'HTML' },
            { value: 'number', label: 'Number' },
            { value: 'checkbox', label: 'Checkbox' },
            { value: 'date', label: 'Date' },
            { value: 'select', label: 'Select' },
            { value: 'multi-select', label: 'Multi-select' },
          ]}
          value={type}
          onChange={(next) => { if (next) setType(next as typeof type) }}
        /></label>
        {error && <p role="alert" className="m-0 text-xs text-destructive">{error}</p>}
        <div className="flex justify-end gap-2"><button type="button" className="h-8 rounded-md px-2 text-xs hover:bg-accent" onClick={close}>Cancel</button><button type="submit" disabled={saving || !label.trim()} className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-50">Add property</button></div>
      </form>, portalContainer ?? document.body,
    )}
  </>
}

export function ColumnHeaderMenu({
  activeFilter,
  activeSort,
  canHide,
  column,
  draggable = false,
  dragging = false,
  filterOperators = DEFAULT_FILTER_OPERATORS,
  filterValues = [],
  label,
  onFilter,
  onHide,
  onMoveFirst,
  onDelete,
  onRename,
  onSort,
}: {
  activeFilter?: ColumnFilterRule
  activeSort: SortConfig
  canHide: boolean
  column: string
  draggable?: boolean
  dragging?: boolean
  filterOperators?: readonly ColumnFilterOperatorOption[]
  filterValues?: readonly unknown[]
  label: string
  onFilter?: (column: string, filter: ColumnFilterRule | null) => void | Promise<void>
  onMoveFirst?: () => void | Promise<void>
  onHide?: (column: string) => void | Promise<void>
  onDelete?: (column: string) => void | Promise<void>
  onRename?: (column: string, label: string) => void | Promise<void>
  onSort?: (column: string, direction: SortDirection | null) => void | Promise<void>
}) {
  const portalContainer = useJsonViewsPortalContainer()
  const [open, setOpen] = useState(false)
  const [draftLabel, setDraftLabel] = useState(label)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editingFilter, setEditingFilter] = useState(false)
  const [editingSort, setEditingSort] = useState(false)
  const [draftFilterOperator, setDraftFilterOperator] = useState(activeFilter?.operator ?? filterOperators[0]?.value ?? 'eq')
  const [draftFilterValue, setDraftFilterValue] = useState(() => filterValueText(activeFilter?.value, activeFilter?.operator))
  const filterValueListId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const sortTriggerRef = useRef<HTMLButtonElement>(null)
  const sortMenuRef = useRef<HTMLDivElement>(null)
  const menuPosition = useAnchoredPosition(open, triggerRef, menuRef)
  const sortPosition = useAnchoredPosition(open && editingSort, sortTriggerRef, sortMenuRef, 'right')
  const renameTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const renameVersionRef = useRef(0)
  const sort = activeSort?.column === column ? activeSort.direction : undefined

  useEffect(() => setDraftLabel(label), [label])
  useEffect(() => {
    if (dragging) setOpen(false)
  }, [dragging])
  useEffect(() => () => {
    if (renameTimerRef.current !== undefined) clearTimeout(renameTimerRef.current)
  }, [])

  const run = async (action: () => void | Promise<void>) => {
    setSaving(true)
    setError(undefined)
    try {
      await action()
      setOpen(false)
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Could not update this column')
    } finally {
      setSaving(false)
    }
  }

  const saveRename = (value: string, delay = 0) => {
    if (renameTimerRef.current !== undefined) clearTimeout(renameTimerRef.current)
    const next = value.trim()
    if (!onRename || !next || next === label) return
    const version = ++renameVersionRef.current
    const save = () => {
      renameTimerRef.current = undefined
      setSaving(true)
      void Promise.resolve(onRename(column, next)).then(() => {
        if (version === renameVersionRef.current) setError(undefined)
      }).catch((renameError: unknown) => {
        if (version === renameVersionRef.current) setError(renameError instanceof Error ? renameError.message : 'Could not rename this column')
      }).finally(() => {
        if (version === renameVersionRef.current) setSaving(false)
      })
    }
    if (delay > 0) renameTimerRef.current = setTimeout(save, delay)
    else save()
  }

  const openMenu = () => {
    setDraftLabel(label)
    setError(undefined)
    setConfirmDelete(false)
    setEditingFilter(false)
    setEditingSort(false)
    setDraftFilterOperator(activeFilter?.operator ?? filterOperators[0]?.value ?? 'eq')
    setDraftFilterValue(filterValueText(activeFilter?.value, activeFilter?.operator))
    setOpen(true)
  }

  const closeMenu = () => {
    setOpen(false)
    saveRename(draftLabel)
  }

  useDismiss({ enabled: open, onDismiss: closeMenu, insideRefs: [triggerRef, menuRef] })

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-id="tabular-column-menu"
        aria-label={`Column options for ${label}`}
        aria-expanded={open}
        aria-haspopup="menu"
        draggable={draggable}
        className="flex h-full min-h-9 w-full min-w-0 items-center px-3 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        title={label}
        onClick={openMenu}
      >
        <span className="block min-w-0 flex-1 overflow-hidden whitespace-nowrap">{label}</span>
        {activeFilter && <Filter data-id="tabular-column-filter-active" aria-hidden className="ml-1.5 h-3 w-3 shrink-0 text-primary" />}
      </button>
      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          role="menu"
          className="z-[100] w-60 rounded-md border border-border bg-card p-1.5 text-foreground shadow-lg"
          style={menuPosition}
        >
        {confirmDelete ? <div className="grid gap-2 p-1">
          <p className="text-xs text-muted-foreground">Delete {label} from every row?</p>
          <div className="flex justify-end gap-1.5">
            <button type="button" className="rounded-md px-2 py-1.5 text-xs hover:bg-accent" onClick={() => setConfirmDelete(false)}>Cancel</button>
            <button type="button" data-id="tabular-confirm-delete-column" disabled={saving} className="rounded-md border border-destructive-border bg-destructive-surface px-2 py-1.5 text-xs font-medium text-destructive-foreground hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50" onClick={() => { if (onDelete) void run(() => onDelete(column)) }}>Delete property</button>
          </div>
        </div> : editingFilter ? <form className="grid gap-2 p-1" aria-label={`Filter ${label}`} onSubmit={(event) => {
          event.preventDefault()
          if (!onFilter) return
          const presenceOnly = draftFilterOperator === 'isEmpty' || draftFilterOperator === 'isNotEmpty'
          void run(() => onFilter(column, {
            operator: draftFilterOperator,
            ...(presenceOnly ? {} : { value: draftFilterValue }),
          }))
        }}>
          <div className="flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-xs font-medium">Filter {label}</span>
          </div>
          <label className="grid gap-1 text-[0.6875rem] text-muted-foreground">Condition
            <MenuSelect
              ariaLabel={`Filter ${label} condition`}
              options={filterOperators}
              value={draftFilterOperator}
              onChange={setDraftFilterOperator}
            />
          </label>
          {draftFilterOperator !== 'isEmpty' && draftFilterOperator !== 'isNotEmpty' && <label className="grid gap-1 text-[0.6875rem] text-muted-foreground">Value
            <input
              autoFocus
              aria-label={`Filter ${label} value`}
              list={filterValueListId}
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder={draftFilterOperator === 'in' || draftFilterOperator === 'notIn' ? 'Comma-separated values' : 'Value'}
              value={draftFilterValue}
              onChange={(event) => setDraftFilterValue(event.target.value)}
            />
            {filterValues.length > 0 && <datalist id={filterValueListId}>
              {filterValues.map((value, index) => <option key={`${filterValueText(value)}:${index}`} value={filterValueText(value)} />)}
            </datalist>}
          </label>}
          <div className="flex justify-between gap-2 pt-1">
            <button type="button" data-id="tabular-clear-filter" disabled={saving || !activeFilter} className="h-8 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40" onClick={() => { if (onFilter) void run(() => onFilter(column, null)) }}>Clear</button>
            <div className="flex gap-1">
              <button type="button" className="h-8 rounded-md px-2 text-xs hover:bg-accent" onClick={() => setEditingFilter(false)}>Back</button>
              <button type="submit" data-id="tabular-apply-filter" disabled={saving || ((draftFilterOperator !== 'isEmpty' && draftFilterOperator !== 'isNotEmpty') && !draftFilterValue.trim())} className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-50">Apply</button>
            </div>
          </div>
        </form> : <>
        {onRename && (
          <div className="mb-1">
            <input
              aria-label={`Rename ${label}`}
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={draftLabel}
              onChange={(event) => {
                setDraftLabel(event.target.value)
                saveRename(event.target.value, 300)
              }}
              onBlur={(event) => saveRename(event.target.value)}
            />
          </div>
        )}
        {onRename && <div className="-mx-1.5 my-1 h-px bg-border" />}
        {onSort && (
          <div role="none" className="relative">
            <button ref={sortTriggerRef} type="button" role="menuitem" data-id="tabular-sort-column" aria-haspopup="menu" aria-expanded={editingSort} disabled={saving} className="flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-accent focus:bg-accent disabled:pointer-events-none disabled:opacity-50" onClick={() => setEditingSort((current) => !current)}>
              <ArrowUpDown className="mr-2 h-3.5 w-3.5" /> Sort <ChevronRight className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
            </button>
            {editingSort && (
              <div
                ref={sortMenuRef}
                role="menu"
                aria-label={`Sort ${label}`}
                className="z-[101] w-52 rounded-md border border-border bg-card p-1.5 text-foreground shadow-lg"
                style={sortPosition}
              >
                <button type="button" role="menuitem" data-id="tabular-sort-ascending" disabled={saving} className="flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-accent focus:bg-accent disabled:pointer-events-none disabled:opacity-50" onClick={() => { void run(() => onSort(column, 'asc')) }}>
                  <ChevronUp className="mr-2 h-3.5 w-3.5" /> Sort ascending
                </button>
                <button type="button" role="menuitem" data-id="tabular-sort-descending" disabled={saving} className="flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-accent focus:bg-accent disabled:pointer-events-none disabled:opacity-50" onClick={() => { void run(() => onSort(column, 'desc')) }}>
                  <ChevronDown className="mr-2 h-3.5 w-3.5" /> Sort descending
                </button>
                {sort && <>
                  <div className="-mx-1.5 my-1 h-px bg-border" />
                  <button type="button" role="menuitem" data-id="tabular-clear-sort" disabled={saving} className="flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-accent focus:bg-accent disabled:pointer-events-none disabled:opacity-50" onClick={() => { void run(() => onSort(column, null)) }}>
                    <X className="mr-2 h-3.5 w-3.5" /> Clear sort
                  </button>
                </>}
              </div>
            )}
          </div>
        )}
        {onFilter && (
          <>
            <div className="-mx-1.5 my-1 h-px bg-border" />
            <button type="button" role="menuitem" data-id="tabular-filter-column" disabled={saving} className="flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-accent focus:bg-accent disabled:pointer-events-none disabled:opacity-50" onClick={() => { setEditingSort(false); setEditingFilter(true) }}>
              <Filter className="mr-2 h-3.5 w-3.5" /> {activeFilter ? 'Edit filter' : 'Filter'}
            </button>
          </>
        )}
        {onMoveFirst && <button type="button" role="menuitem" disabled={saving} className="flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-accent focus:bg-accent disabled:pointer-events-none disabled:opacity-50" onClick={() => { void run(onMoveFirst) }}>
          <ArrowLeftToLine className="mr-2 h-3.5 w-3.5" /> Move first
        </button>}
        {onHide && (
          <>
            <div className="-mx-1.5 my-1 h-px bg-border" />
            <button type="button" role="menuitem" data-id="tabular-hide-column" disabled={saving || !canHide} className="flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-accent focus:bg-accent disabled:pointer-events-none disabled:opacity-50" onClick={() => { void run(() => onHide(column)) }}>
              <EyeOff className="mr-2 h-3.5 w-3.5" /> Hide column
            </button>
          </>
        )}
        {onDelete && <>
          <div className="-mx-1.5 my-1 h-px bg-border" />
          <button type="button" role="menuitem" data-id="tabular-delete-column" disabled={saving} className="flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-left text-sm text-destructive outline-none transition-colors hover:bg-accent focus:bg-accent disabled:pointer-events-none disabled:opacity-50" onClick={() => setConfirmDelete(true)}><Trash2 className="mr-2 h-3.5 w-3.5" /> Delete property</button>
        </>}
        </>}
        {error && <p role="alert" className="px-2 py-1 text-xs text-destructive">{error}</p>}
        </div>,
        portalContainer ?? document.body,
      )}
    </>
  )
}
