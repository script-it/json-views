import type { ReactNode } from 'react'
import type { UiSize } from '../lib/ui-size.js'
import type { JsonViewFilterOperator, ValuePath } from '@script-it/json-views-core'

export type SortDirection = 'asc' | 'desc'
export type SortConfig = { column: string; direction: SortDirection } | null

export interface ColumnFilterRule {
  operator: JsonViewFilterOperator
  value?: unknown
}

export interface ColumnFilterConfig extends ColumnFilterRule {
  column: string
}

export interface ColumnFilterOperatorOption {
  label: string
  value: JsonViewFilterOperator
}

export interface TabularObjectArrayViewProps {
  arr: Record<string, unknown>[]
  /** Stable source identities when the host reorders projected records. */
  rowKeys?: readonly string[]
  /** Exact source identity for comparison of numeric literals, including nested values. */
  getCellSourcePath?: (rowIndex: number, column: string) => ValuePath | undefined
  columns: string[]
  /** Optional display labels let projected views keep stable internal column
   *  keys even when two declared labels are identical. */
  columnLabels?: Readonly<Record<string, string>>
  /** Stable field identities for cached column state when projected columns move. */
  columnStateKeys?: Readonly<Record<string, string>>
  filePath?: string
  viewStateKey: string
  onOpenCell: (cell: {
    value: unknown
    rowIndex: number
    column: string
  }) => void
  /** All rows after filtering/sorting, in display order (independent of virtualization). */
  onVisibleRowsChange?: (rowIndices: readonly number[], filtered: boolean) => void
  /** Lets a host add behavior around a cell without coupling this table to a schema. */
  renderCell?: (cell: {
    value: unknown
    rowIndex: number
    column: string
    open: () => void
  }) => ReactNode
  /** Declares the one cell that represents and opens the whole record. */
  recordNavigation?: {
    titleColumn: string
    getLabel: (rowIndex: number) => string
    onOpen: (rowIndex: number) => void
    renderTitle: (cell: { value: unknown; rowIndex: number; column: string }) => ReactNode
  }
  /** Appends a blank record to an array-backed table. */
  onAddRow?: () => Promise<void>
  rowAdditionDisabled?: boolean
  /** Adds row deletion via checkbox selection plus the footer's delete
   * action (single rows included). Receives unsorted row indices in
   * descending order so positional patchers can apply them in one pass. */
  onDeleteRows?: (rowIndices: number[]) => Promise<void>
  /** Enables selection for copying and returns agent-ready JSON for the
   * selected unsorted row indices in their current visible table order. */
  getRowsCopyText?: (rowIndices: readonly number[]) => string
  /** Returns filename-qualified JSON Pointer references for selected rows. */
  getRowsReferenceText?: (rowIndices: readonly number[]) => string
  rowDeletionDisabled?: boolean
  initialCell?: { row: number; col: string }
  /** Scales row height to match the host's UI size. */
  uiSize?: UiSize
  /**
   * When true, the table stays content-sized until it reaches the parent's
   * height, then its rows scroll internally while the footer remains visible.
   * When false (default), the scroll area is capped at min(600px, 70vh) for
   * unbounded layouts (inline outputs, embeds).
   */
  fillHeight?: boolean
  /** Enables transient sort/hide state for tables without a saved view. */
  presentationControls?: boolean
  /** Persisted views can expose the same actions directly from the column
   *  heading while the host owns the metadata update. */
  activeColumnSort?: SortConfig
  onColumnSort?: (column: string, direction: SortDirection | null) => void | Promise<void>
  /** Externally managed filters, used by declared JSON Views whose metadata
   *  owns filtering. Omit to use transient table presentation state. */
  activeColumnFilters?: readonly ColumnFilterConfig[]
  /** Optional field-specific wording or operator restrictions. */
  columnFilterOperators?: Readonly<Record<string, readonly ColumnFilterOperatorOption[]>>
  /** Values shown as input suggestions while still allowing free text. */
  columnFilterValues?: Readonly<Record<string, readonly unknown[]>>
  onColumnFilter?: (column: string, filter: ColumnFilterRule | null) => void | Promise<void>
  onColumnRename?: (column: string, label: string) => void | Promise<void>
  onColumnHide?: (column: string) => void | Promise<void>
  /** Reorders a declared column while preserving its data path. */
  onColumnMove?: (column: string, target: string, position: 'before' | 'after') => void | Promise<void>
  onColumnDelete?: (column: string) => void | Promise<void>
  onAddColumn?: (column: { label: string; type: 'text' | 'markdown' | 'html' | 'number' | 'checkbox' | 'date' | 'select' | 'multi-select' }) => void | Promise<void>
}
