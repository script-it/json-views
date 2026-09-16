import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { basicSetup } from 'codemirror'
import { json } from '@codemirror/lang-json'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { Compartment, EditorState, StateEffect, StateField, Transaction, type Extension } from '@codemirror/state'
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view'
import { tags } from '@lezer/highlight'
import { AlignLeft, ArrowLeft, Code2 } from 'lucide-react'
import { useJsonViewsDevice } from '../browser-device.js'
import { cn } from '../lib/cn.js'
import { ConditionalTooltip } from '../primitives/tooltip.js'

const SOURCE_BUTTON_CLASS = 'grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring active:scale-[0.97]'

export function SourceToggle({ active, format, onToggle, disabled = false }: { active: boolean; format: string; onToggle: () => void; disabled?: boolean }) {
  const action = active ? 'Hide' : 'Show'
  return (
    <ConditionalTooltip enabled={disabled} label={`${format} must be valid before switching to views.`}>
    <span className="inline-flex shrink-0" tabIndex={disabled ? 0 : undefined}>
    <button
      type="button"
      data-id="jsonView-source-toggle"
      aria-label={`${action} ${format} source`}
      title={disabled ? undefined : `${action} ${format} source`}
      disabled={disabled}
      aria-pressed={active}
      className={cn(SOURCE_BUTTON_CLASS, 'disabled:pointer-events-none disabled:opacity-50', active && 'bg-accent text-foreground')}
      onClick={onToggle}
    >
      <Code2 className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
    </span>
    </ConditionalTooltip>
  )
}

export interface SourceRange { start: number; end: number }

export const setSourceTargetRanges = StateEffect.define<readonly SourceRange[]>()

function sourceTargetSet(ranges: readonly SourceRange[], length: number): DecorationSet {
  return Decoration.set(ranges.flatMap((range) => range.start >= 0 && range.start < range.end && range.end <= length
    ? [Decoration.mark({ class: 'cm-source-target', attributes: { 'data-id': 'jsonView-source-target' } }).range(range.start, range.end)]
    : []), true)
}

export const sourceTargetDecorations = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update: (decorations, transaction) => {
    let next = decorations.map(transaction.changes)
    for (const effect of transaction.effects) {
      if (effect.is(setSourceTargetRanges)) next = sourceTargetSet(effect.value, transaction.state.doc.length)
    }
    return next
  },
  provide: (field) => EditorView.decorations.from(field),
})

const jsonHighlightStyle = HighlightStyle.define([
  { tag: tags.propertyName, color: 'var(--jv-source-key)' },
  { tag: tags.string, color: 'var(--jv-source-string)' },
  { tag: tags.number, color: 'var(--jv-source-number)' },
  { tag: [tags.bool, tags.null], color: 'var(--jv-source-literal)' },
  { tag: [tags.brace, tags.squareBracket, tags.separator], color: 'var(--jv-muted-foreground)' },
])

function sourceEditorTheme(fontSize: number): Extension {
  return EditorView.theme({
    '&': {
      height: '100%',
      minHeight: '100%',
      backgroundColor: 'transparent',
      color: 'var(--jv-foreground)',
      fontSize: `${fontSize}px`,
    },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': {
      overflow: 'auto',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      lineHeight: `${fontSize * 1.625}px`,
    },
    '.cm-content': {
      minHeight: '100%',
      padding: '12px 0',
      caretColor: 'var(--jv-foreground)',
    },
    '.cm-cursorLayer .cm-cursor, .cm-dropCursor': {
      borderLeftColor: 'var(--jv-foreground) !important',
      borderLeftWidth: '2px !important',
    },
    '.cm-line': { padding: '0 12px 0 6px' },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      color: 'var(--jv-muted-foreground)',
      border: 'none',
      paddingLeft: '4px',
    },
    '.cm-gutterElement': { padding: '0 3px' },
    '.cm-foldGutter .cm-gutterElement': {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0 2px',
    },
    '.cm-foldGutter .cm-gutterElement > span': {
      display: 'inline-flex',
      width: '12px',
      height: '12px',
      alignItems: 'center',
      justifyContent: 'center',
      lineHeight: '1',
      transform: 'translateY(-1px)',
    },
    '.cm-activeLine, .cm-activeLineGutter': {
      backgroundColor: 'color-mix(in srgb, var(--jv-accent) 45%, transparent)',
    },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
      backgroundColor: 'color-mix(in srgb, var(--jv-primary) 22%, transparent)',
    },
    '.cm-foldPlaceholder': {
      backgroundColor: 'var(--jv-muted)',
      color: 'var(--jv-muted-foreground)',
      border: '1px solid var(--jv-border)',
    },
    '.cm-source-target': {
      backgroundColor: 'color-mix(in srgb, var(--jv-primary) 20%, transparent)',
      borderRadius: '2px',
    },
  })
}

function CodeMirrorSource({
  content,
  format,
  onChange,
  readOnly,
  targetRanges,
  syntaxDisabled,
}: {
  syntaxDisabled?: boolean
  content: string
  format: string
  onChange: (content: string) => void
  readOnly: boolean
  targetRanges: readonly SourceRange[]
}) {
  const device = useJsonViewsDevice()
  const mount = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | undefined>(undefined)
  const applyingExternalContent = useRef(false)
  const onChangeRef = useRef(onChange)
  const languageCompartment = useMemo(() => new Compartment(), [])
  const readOnlyCompartment = useMemo(() => new Compartment(), [])
  const themeCompartment = useMemo(() => new Compartment(), [])
  const targetKey = JSON.stringify(targetRanges)
  const revealedTarget = useRef(false)
  onChangeRef.current = onChange

  useLayoutEffect(() => {
    if (!mount.current) return
    const extensions: Extension[] = [
      basicSetup,
      sourceTargetDecorations,
      syntaxHighlighting(jsonHighlightStyle),
      EditorState.tabSize.of(2),
      EditorView.editorAttributes.of({ 'data-id': 'jsonView-source-editor' }),
      EditorView.contentAttributes.of({ 'aria-label': `${format} source`, spellcheck: 'false' }),
      readOnlyCompartment.of([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]),
      themeCompartment.of(sourceEditorTheme(device === 'mobile' ? 16 : 12)),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !applyingExternalContent.current) onChangeRef.current(update.state.doc.toString())
      }),
    ]
    extensions.push(languageCompartment.of(format === 'JSON' && !syntaxDisabled ? json() : []))
    view.current = new EditorView({
      state: EditorState.create({ doc: content, extensions }),
      parent: mount.current,
    })
    return () => {
      view.current?.destroy()
      view.current = undefined
    }
  }, [])

  useLayoutEffect(() => {
    view.current?.dispatch({ effects: languageCompartment.reconfigure(format === 'JSON' && !syntaxDisabled ? json() : []) })
  }, [format, syntaxDisabled, languageCompartment])

  useLayoutEffect(() => {
    const editor = view.current
    if (!editor || editor.state.doc.toString() === content) return
    applyingExternalContent.current = true
    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: content },
      effects: editor.scrollSnapshot(),
      annotations: Transaction.addToHistory.of(false),
    })
    applyingExternalContent.current = false
  }, [content])

  useLayoutEffect(() => {
    view.current?.dispatch({
      effects: readOnlyCompartment.reconfigure([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]),
    })
  }, [readOnly, readOnlyCompartment])

  useLayoutEffect(() => {
    view.current?.dispatch({
      effects: themeCompartment.reconfigure(sourceEditorTheme(device === 'mobile' ? 16 : 12)),
    })
  }, [device, themeCompartment])

  useLayoutEffect(() => {
    const editor = view.current
    if (!editor) return
    editor.dispatch({ effects: setSourceTargetRanges.of(targetRanges) })
  }, [targetKey])

  useEffect(() => {
    const editor = view.current
    const first = targetRanges[0]
    if (!editor || !first || revealedTarget.current) return
    const timer = setTimeout(() => {
      if (view.current !== editor || revealedTarget.current) return
      revealedTarget.current = true
      const lineTop = editor.lineBlockAt(first.start).top
      const viewportHeight = editor.scrollDOM.clientHeight
      editor.scrollDOM.scrollTop = Math.max(0, lineTop - viewportHeight * 0.35)
    }, 0)
    return () => clearTimeout(timer)
  }, [targetKey])

  return <div ref={mount} className="h-full min-h-full w-full" />
}

export function SourceFormatButton({ format, disabled, onFormat }: { format: string; disabled: boolean; onFormat: () => void }) {
  return <button type="button" data-id="jsonView-source-format" aria-label={`Format ${format}`} title={`Format ${format}`}
    className={cn(SOURCE_BUTTON_CLASS, 'disabled:pointer-events-none disabled:opacity-50')} disabled={disabled} onClick={onFormat}>
    <AlignLeft className="h-3.5 w-3.5" aria-hidden="true" />
  </button>
}

export function SourceEditor({
  embedded = false,
  content,
  dirty,
  fillHeight,
  format,
  invalidSourceError,
  saveStatus,
  onChange,
  onClose,
  onFormat,
  readOnly,
  saveError,
  saving,
  targetRanges = [],
}: {
  embedded?: boolean
  saveStatus?: ReactNode
  content: string
  dirty: boolean
  fillHeight: boolean
  format: string
  invalidSourceError?: string | null
  onChange: (content: string) => void
  onClose: () => void
  onFormat?: () => void
  readOnly: boolean
  saveError?: string
  saving: boolean
  targetRanges?: readonly SourceRange[]
}) {
  const error = invalidSourceError ?? saveError
  const [targetDismissed, setTargetDismissed] = useState(false)
  const visibleTargetRanges = targetDismissed ? [] : targetRanges
  const dismissTarget = useCallback(() => setTargetDismissed(true), [])

  return (
    <div
      data-id="jsonView-source-view"
      className={cn('flex min-h-0 flex-1 flex-col bg-background text-foreground', fillHeight && 'h-full')}
      onPointerDownCapture={dismissTarget}
      onClickCapture={dismissTarget}
    >
      <div className={cn('mx-auto flex min-h-0 w-full flex-1 flex-col', !embedded && 'max-w-6xl px-3 py-4 sm:px-6 sm:py-5', fillHeight && 'h-full')}>
        {!embedded && <div data-id="json-viewer-toolbar" className="relative flex min-h-8 shrink-0 items-center gap-2">
          {!embedded && <ConditionalTooltip enabled={Boolean(invalidSourceError)} label={`${format} must be valid before switching to views.`}>
          <span className="mr-auto inline-flex" tabIndex={invalidSourceError ? 0 : undefined}>
          <button
            type="button"
            data-id="jsonView-source-views"
            className="disabled:pointer-events-none disabled:opacity-50 mr-auto flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            disabled={Boolean(invalidSourceError)}
            onClick={onClose}
          ><ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Views</button>
          </span>
          </ConditionalTooltip>}
          {onFormat && <SourceFormatButton format={format} disabled={Boolean(invalidSourceError) || saving} onFormat={onFormat} />}
          {!saveStatus && <span className={cn('min-w-12 text-right text-xs text-muted-foreground', error && 'text-destructive')} role="status">
            {invalidSourceError ? `Invalid ${format}` : saveError ? 'Save failed' : saving ? 'Saving…' : readOnly ? 'Read only' : dirty ? 'Unsaved changes' : 'Saved'}
          </span>}
          {!embedded && <SourceToggle active format={format} onToggle={onClose} disabled={Boolean(invalidSourceError)} />}
          {!embedded && saveStatus}
        </div>}
        {!saveStatus && error && <p
          data-id="jsonView-source-error"
          role={error ? 'alert' : undefined}
          className={cn('flex shrink-0 items-center overflow-hidden text-ellipsis whitespace-nowrap text-xs text-destructive', error ? 'h-6' : 'h-1')}
          title={error ?? undefined}
        >{error}</p>}
        <div className={cn('relative mt-1 w-full flex-1 overflow-hidden rounded-md border border-border bg-background focus-within:ring-1 focus-within:ring-ring', fillHeight ? 'min-h-0' : 'min-h-96')}>
          <CodeMirrorSource syntaxDisabled={invalidSourceError?.includes('nesting limit')} content={content} format={format} onChange={(next) => { dismissTarget(); onChange(next) }} readOnly={readOnly} targetRanges={visibleTargetRanges} />
        </div>
      </div>
    </div>
  )
}
