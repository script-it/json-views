import { createContext, useContext, useRef, useState, type ReactNode } from 'react'
import type { ValuePath } from '@script-it/json-views-core'

export interface JsonViewsTablePresentationState {
  collapsedColumns?: string[]
  columnWidths?: Record<string, number>
  filters?: Array<{ column: string; operator: string; value?: unknown }>
  scrollLeft?: number
  scrollTop?: number
  sort?: { column: string; direction: 'asc' | 'desc' } | null
}

export interface JsonViewsNavigationPresentationState {
  stack: Array<{ path: ValuePath; key: string; kind?: 'value' | 'record'; titleKey?: string }>
  currentPath: ValuePath
  currentKind?: 'value' | 'record'
  currentTitleKey?: string
}

export interface JsonViewsGeneralPresentationState {
  scrollPositions?: Record<string, number>
}

/**
 * Serializable, visual-only state for one document. Hosts may cache this beside
 * a document, but must not write it into the document's `$jsonviews` metadata.
 */
export interface JsonViewsPresentationState {
  version: 1
  activeView?: string
  queries?: Record<string, string>
  /** Unsaved explicit view configuration, scoped by view and data path. */
  viewDrafts?: Record<string, Record<string, unknown>>
  navigation?: Record<string, JsonViewsNavigationPresentationState>
  tables?: Record<string, JsonViewsTablePresentationState>
  general?: Record<string, JsonViewsGeneralPresentationState>
}

type PresentationStateChange = (state: JsonViewsPresentationState) => void

/** Bounded, instance-owned presentation state. Never shared across host viewers. */
export class ViewStateCache<T> {
  private readonly entries: Map<string, T>
  constructor(initial?: Record<string, T>, private readonly onChange?: () => void) {
    this.entries = new Map(Object.entries(initial ?? {}).slice(-30))
  }
  get(key: string): T | undefined { return this.entries.get(key) }
  set(key: string, value: T): void {
    this.entries.delete(key)
    this.entries.set(key, value)
    if (this.entries.size > 30) this.entries.delete(this.entries.keys().next().value!)
    this.onChange?.()
  }
  delete(key: string): void {
    if (!this.entries.delete(key)) return
    this.onChange?.()
  }
  toRecord(): Record<string, T> { return Object.fromEntries(this.entries) }
}

function createViewerState(
  initial: JsonViewsPresentationState | undefined,
  onChange: () => void,
) {
  let activeView = initial?.version === 1 ? initial.activeView : undefined
  const changed = () => onChange()
  const state = {
    get activeView() { return activeView },
    setActiveView(value: string) {
      if (activeView === value) return
      activeView = value
      changed()
    },
    queries: new ViewStateCache<string>(initial?.version === 1 ? initial.queries : undefined, changed),
    viewDrafts: new ViewStateCache<Record<string, unknown>>(initial?.version === 1 ? initial.viewDrafts : undefined, changed),
    navigation: new ViewStateCache<JsonViewsNavigationPresentationState>(initial?.version === 1 ? initial.navigation : undefined, changed),
    tables: new ViewStateCache<JsonViewsTablePresentationState>(initial?.version === 1 ? initial.tables : undefined, changed),
    general: new ViewStateCache<JsonViewsGeneralPresentationState>(initial?.version === 1 ? initial.general : undefined, changed),
    snapshot(): JsonViewsPresentationState {
      const queries = state.queries.toRecord()
      const viewDrafts = state.viewDrafts.toRecord()
      const navigation = state.navigation.toRecord()
      const tables = state.tables.toRecord()
      const general = state.general.toRecord()
      return {
        version: 1,
        ...(activeView ? { activeView } : {}),
        ...(Object.keys(queries).length > 0 ? { queries } : {}),
        ...(Object.keys(viewDrafts).length > 0 ? { viewDrafts } : {}),
        ...(Object.keys(navigation).length > 0 ? { navigation } : {}),
        ...(Object.keys(tables).length > 0 ? { tables } : {}),
        ...(Object.keys(general).length > 0 ? { general } : {}),
      }
    },
  }
  return state
}

type ViewerState = ReturnType<typeof createViewerState>
const ViewerStateContext = createContext<ViewerState | undefined>(undefined)

export function ViewerStateProvider({
  children,
  initialState,
  onChange,
}: {
  children: ReactNode
  initialState?: JsonViewsPresentationState
  onChange?: PresentationStateChange
}) {
  const changeHandler = useRef(onChange)
  changeHandler.current = onChange
  const stateRef = useRef<ViewerState | undefined>(undefined)
  if (!stateRef.current) {
    stateRef.current = createViewerState(initialState, () => {
      const state = stateRef.current
      if (state) changeHandler.current?.(state.snapshot())
    })
  }
  return <ViewerStateContext.Provider value={stateRef.current}>{children}</ViewerStateContext.Provider>
}

export function useViewerState() {
  const provided = useContext(ViewerStateContext)
  const [local] = useState(() => createViewerState(undefined, () => undefined))
  return provided ?? local
}
