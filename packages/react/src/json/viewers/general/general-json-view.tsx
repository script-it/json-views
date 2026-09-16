import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'

import type { UiSize } from '../../../lib/ui-size.js'
import { useViewerState } from '../../../viewer-state.js'
import {
  getValueAtPath,
  isJsonViewTableCandidate,
  valuePathKey,
  VALUE_PATH_MISSING,
  type ValuePath,
} from '@script-it/json-views-core'
import type { JsonViewSchemaDescriptor } from '@script-it/json-views-core'
import type { JsonViewSchemaExternalWidgetRenderer } from '../../schema-value.js'
import { useJsonViewsRegistries } from '../../../widget-registry.js'
import { GeneralJsonNodeView, type GeneralJsonAtomicEditing } from './json-node-view.js'

interface NavigationItem {
  key: string
  path: ValuePath
  kind: 'value' | 'record'
  titleKey?: string
}

export interface GeneralJsonRecordTarget {
  path: ValuePath
  titleKey?: string
  onBack?: () => void
  breadcrumbLabels?: readonly string[]
  backLabel?: string
}

interface GeneralJsonViewProps {
  root: unknown
  defaultKey: string
  breadcrumb?: {
    ancestors: readonly string[]
    backLabel: string
    onBack?: () => void
  }
  /** Absolute source path used as this navigator's root. */
  initialPath?: ValuePath
  filePath?: string
  editing?: {
    canReplace?: (path: ValuePath) => boolean
    clear: (path: ValuePath) => Promise<void>
    replace: (path: ValuePath, value: unknown) => Promise<void>
    removeMany: (paths: ValuePath[]) => Promise<void>
    saving: boolean
  }
  renderMarkdown?: (content: string) => ReactNode
  uiSize?: UiSize
  fillHeight?: boolean
  schemaForPath?: (path: ValuePath) => JsonViewSchemaDescriptor | undefined
  renderExternalWidget?: JsonViewSchemaExternalWidgetRenderer
  onCurrentPathChange?: (path: ValuePath, sourcePaths?: readonly ValuePath[]) => void
  renderRecord?: (target: GeneralJsonRecordTarget) => ReactNode
}

function BreadcrumbSegment({ label }: { label: string }) {
  const characters = Array.from(label)
  const clipped = characters.length > 20
  const visible = clipped ? `${characters.slice(0, 10).join('')}…` : label
  return <span title={clipped ? label : undefined} aria-label={clipped ? label : undefined}>{visible}</span>
}

export function NavigationBreadcrumb({ labels, onBack, backLabel }: { labels: readonly string[]; onBack?: () => void; backLabel?: string }) {
  if (!onBack) return null
  return <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-2">
    <button type="button" className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" aria-label={backLabel ?? 'Back'} onClick={onBack} title="Back">
      <ArrowLeft className="h-4 w-4" />
    </button>
    <span data-id="jsonView-breadcrumb-path" className="flex min-w-0 items-center whitespace-nowrap text-xs text-muted-foreground">
      {labels.map((label, index) => <span key={`${index}:${label}`} className="contents">
        {index > 0 && <span aria-hidden className="mx-1">{' / '}</span>}
        <BreadcrumbSegment label={label} />
      </span>)}
    </span>
  </nav>
}

function rootHistory(defaultKey: string, initialPath: ValuePath): NavigationItem[] {
  return [{ key: defaultKey, path: initialPath, kind: 'value' }]
}

function restoreHistory(
  root: unknown,
  defaultKey: string,
  initialPath: ValuePath,
  state: ReturnType<typeof useViewerState>['navigation'],
  filePath?: string,
): NavigationItem[] {
  const saved = filePath ? state.get(filePath) : undefined
  if (!saved) return rootHistory(defaultKey, initialPath)

  const currentIsInitial = saved.currentPath.length === initialPath.length
    && initialPath.every((segment, index) => saved.currentPath[index] === segment)
  const currentKey = currentIsInitial
    ? defaultKey
    : saved.currentPath.length > 0
      ? String(saved.currentPath[saved.currentPath.length - 1])
      : defaultKey
  const history = [
    ...saved.stack.map(({ key, path, kind = 'value', titleKey }) => ({ key, path, kind, titleKey })),
    { key: currentKey, path: saved.currentPath, kind: saved.currentKind ?? 'value', titleKey: saved.currentTitleKey },
  ]
  const current = history[history.length - 1]
  const remainsInsideView = current && initialPath.every(
    (segment, index) => current.path[index] === segment,
  )
  return current && remainsInsideView && getValueAtPath(root, current.path) !== VALUE_PATH_MISSING
    ? history
    : rootHistory(defaultKey, initialPath)
}

/** Owns navigation and display state for the general JSON renderer. */
export function GeneralJsonView({
  breadcrumb,
  root,
  defaultKey,
  initialPath = [],
  filePath,
  editing,
  renderMarkdown,
  uiSize,
  fillHeight = false,
  schemaForPath,
  renderExternalWidget,
  onCurrentPathChange,
  renderRecord,
}: GeneralJsonViewProps) {
  const { widgets } = useJsonViewsRegistries()
  const { general, navigation } = useViewerState()
  const savedGeneralState = filePath ? general.get(filePath) : undefined
  const [history, setHistory] = useState<NavigationItem[]>(
    () => restoreHistory(root, defaultKey, initialPath, navigation, filePath),
  )
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const scrollSaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const scrollPositionsRef = useRef<Record<string, number>>({ ...savedGeneralState?.scrollPositions })
  const tableCellPositionsRef = useRef<Record<string, { row: number; col: string }>>({})
  const [visibleSourcePaths, setVisibleSourcePaths] = useState<{ pathKey: string; paths?: readonly ValuePath[] }>({ pathKey: '' })

  const current = history[history.length - 1] ?? rootHistory(defaultKey, initialPath)[0]
  const resolvedNode = getValueAtPath(root, current.path)
  const navigationIsValid = resolvedNode !== VALUE_PATH_MISSING
  const effectiveHistory = navigationIsValid ? history : rootHistory(defaultKey, initialPath)
  const effectiveCurrent = effectiveHistory[effectiveHistory.length - 1]
  const initialNode = getValueAtPath(root, initialPath)
  const currentNode = navigationIsValid
    ? resolvedNode
    : initialNode === VALUE_PATH_MISSING ? root : initialNode
  const currentPathKey = valuePathKey(effectiveCurrent.path)
  const currentSourcePaths = visibleSourcePaths.pathKey === currentPathKey ? visibleSourcePaths.paths : undefined
  const currentSourcePathsKey = JSON.stringify(currentSourcePaths)

  useEffect(() => {
    onCurrentPathChange?.(effectiveCurrent.path, currentSourcePaths)
  }, [currentPathKey, currentSourcePathsKey, onCurrentPathChange])

  const reportVisibleSourcePaths = useCallback((paths?: readonly ValuePath[]) => {
    setVisibleSourcePaths((current) => current.pathKey === currentPathKey && JSON.stringify(current.paths) === JSON.stringify(paths)
      ? current
      : { pathKey: currentPathKey, paths })
  }, [currentPathKey])

  useEffect(() => {
    if (!filePath) return
    const next = {
      stack: effectiveHistory.slice(0, -1),
      currentPath: effectiveCurrent.path,
      currentKind: effectiveCurrent.kind,
      currentTitleKey: effectiveCurrent.titleKey,
    }
    if (JSON.stringify(navigation.get(filePath)) !== JSON.stringify(next)) navigation.set(filePath, next)
  }, [effectiveCurrent.path, effectiveHistory, filePath, navigation])

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      if (!scrollContainerRef.current) return
      scrollContainerRef.current.scrollTop = scrollPositionsRef.current[currentPathKey] ?? 0
    })
    return () => window.cancelAnimationFrame(frameId)
  }, [currentPathKey])

  const flushScrollPosition = useCallback(() => {
    if (!scrollSaveTimer.current || !filePath) return
    clearTimeout(scrollSaveTimer.current)
    scrollSaveTimer.current = undefined
    general.set(filePath, {
      ...general.get(filePath),
      scrollPositions: { ...scrollPositionsRef.current },
    })
  }, [filePath, general])

  const captureScrollPosition = () => {
    scrollPositionsRef.current[currentPathKey] = scrollContainerRef.current?.scrollTop ?? 0
    if (!filePath) return
    if (scrollSaveTimer.current) clearTimeout(scrollSaveTimer.current)
    scrollSaveTimer.current = setTimeout(flushScrollPosition, 120)
  }

  useEffect(() => {
    window.addEventListener('pagehide', flushScrollPosition, true)
    return () => {
      window.removeEventListener('pagehide', flushScrollPosition, true)
      flushScrollPosition()
    }
  }, [flushScrollPosition])

  const navigateTo = (key: string, relativePath: ValuePath = [key], record?: { titleKey?: string }) => {
    const nextPath = [...effectiveCurrent.path, ...relativePath]
    if (getValueAtPath(root, nextPath) === VALUE_PATH_MISSING) return
    captureScrollPosition()
    setHistory((currentHistory) => [
      ...(navigationIsValid ? currentHistory : rootHistory(defaultKey, initialPath)),
      { key, path: nextPath, kind: record ? 'record' : 'value', titleKey: record?.titleKey },
    ])
  }

  const goBack = () => {
    captureScrollPosition()
    setHistory((currentHistory) => currentHistory.length > 1
      ? currentHistory.slice(0, -1)
      : currentHistory)
  }

  const atomicEditing: GeneralJsonAtomicEditing | undefined = editing
      ? {
        canReplace: editing.canReplace,
        clear: editing.clear,
        commit: editing.replace,
        removeMany: editing.removeMany,
        saving: editing.saving,
      }
    : undefined

  const individualObject = currentNode !== null && typeof currentNode === 'object' && !Array.isArray(currentNode)
    && !isJsonViewTableCandidate(currentNode)
  const currentDescriptor = schemaForPath?.(effectiveCurrent.path)
  const registeredContainer = currentDescriptor && (widgets.get(currentDescriptor.type) || widgets.getDisplay(currentDescriptor.type) || renderExternalWidget)
  if (renderRecord && !registeredContainer && (effectiveCurrent.kind === 'record' || individualObject)) {
    return <div className="flex min-h-0 flex-1 flex-col">
      {renderRecord({
        path: effectiveCurrent.path,
        titleKey: effectiveCurrent.titleKey,
        onBack: effectiveHistory.length > 1 ? goBack : breadcrumb?.onBack,
        breadcrumbLabels: [...(breadcrumb?.ancestors ?? []), ...effectiveHistory.map(({ key }) => key)],
        backLabel: effectiveHistory.length > 1 ? 'Back' : breadcrumb?.backLabel,
      })}
    </div>
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <NavigationBreadcrumb labels={[...(breadcrumb?.ancestors ?? []), ...effectiveHistory.map(({ key }) => key)]} onBack={effectiveHistory.length > 1 ? goBack : breadcrumb?.onBack} backLabel={effectiveHistory.length > 1 ? 'Back' : breadcrumb?.backLabel} />
      <div
        ref={scrollContainerRef}
        className={fillHeight
          ? 'flex min-h-0 flex-1 flex-col overflow-auto overscroll-x-none'
          : 'flex-1 overflow-auto overscroll-x-none'}
        onScroll={captureScrollPosition}
      >
        <GeneralJsonNodeView
          node={currentNode}
          navigateTo={navigateTo}
          filePath={filePath}
          currentPathKey={currentPathKey}
          currentJsonPath={effectiveCurrent.path}
          currentLabel={effectiveCurrent.key}
          renderAsMarkdown={
            typeof currentNode === 'string'
            && schemaForPath?.(effectiveCurrent.path)?.type === 'markdown'
          }
          getTableCellPosition={(path) => tableCellPositionsRef.current[path]}
          setTableCellPosition={(path, cell) => {
            tableCellPositionsRef.current[path] = cell
          }}
          renderMarkdown={renderMarkdown}
          uiSize={uiSize}
          fillHeight={fillHeight}
          atomicEditing={atomicEditing}
          schemaForPath={schemaForPath}
          renderExternalWidget={renderExternalWidget}
          onVisibleSourcePathsChange={reportVisibleSourcePaths}
        />
      </div>
    </div>
  )
}
