import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Copy } from 'lucide-react'
import { copyTextToClipboard } from '../lib/clipboard.js'
import { InlineFeedbackAction } from '../primitives/inline-feedback-action.js'
import { cn } from '../lib/cn.js'

type CopyFormat = 'path' | 'record'

export function CopyJsonAction({
  className,
  dataId,
  getPathText,
  getRecordText,
  label,
  pathLabel,
  recordLabel,
  tone = 'default',
}: {
  className?: string
  dataId: string
  getPathText: () => string
  getRecordText: () => string
  label: string
  pathLabel: 'path' | 'paths'
  recordLabel: 'record' | 'records'
  tone?: 'default' | 'strong'
}) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  const [copying, setCopying] = useState(false)
  const [format, setFormat] = useState<CopyFormat>('path')
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const rootRef = useRef<HTMLDivElement>(null)
  const selectedLabel = useRef<HTMLSpanElement>(null)
  const alternateLabel = useRef<HTMLSpanElement>(null)
  const previousLabelRects = useRef<Partial<Record<CopyFormat, DOMRect>> | undefined>(undefined)

  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current)
  }, [])

  useLayoutEffect(() => {
    const previous = previousLabelRects.current
    previousLabelRects.current = undefined
    if (!previous || (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) return
    for (const copyFormat of ['path', 'record'] as const) {
      const choice = copyFormat === format ? selectedLabel.current : alternateLabel.current
      const prior = previous[copyFormat]
      if (!choice || !prior || typeof choice.animate !== 'function') continue
      const next = choice.getBoundingClientRect()
      const x = prior.left - next.left
      if (Math.abs(x) < 1) continue
      choice.animate(
        [{ transform: `translateX(${x}px)` }, { transform: 'translateX(0)' }],
        { duration: 180, easing: 'cubic-bezier(.2, .8, .2, 1)' },
      )
    }
  }, [format])

  const scheduleReset = () => {
    if (resetTimer.current) clearTimeout(resetTimer.current)
    resetTimer.current = setTimeout(() => {
      const restoreFocus = rootRef.current?.contains(document.activeElement) === true
      setStatus('idle')
      setFormat('path')
      if (restoreFocus) setTimeout(() => rootRef.current?.querySelector('button')?.focus(), 0)
    }, 2000)
  }

  const copy = async (nextFormat: CopyFormat) => {
    if (copying) return
    if (resetTimer.current) clearTimeout(resetTimer.current)
    if (status === 'copied' && nextFormat !== format) {
      const alternateFormat: CopyFormat = format === 'path' ? 'record' : 'path'
      previousLabelRects.current = {
        [format]: selectedLabel.current?.getBoundingClientRect(),
        [alternateFormat]: alternateLabel.current?.getBoundingClientRect(),
      }
    }
    setCopying(true)
    try {
      await copyTextToClipboard(nextFormat === 'path' ? getPathText() : getRecordText())
      setFormat(nextFormat)
      setStatus('copied')
      scheduleReset()
    } catch {
      previousLabelRects.current = undefined
      setStatus('error')
    } finally {
      setCopying(false)
    }
  }

  const names: Record<CopyFormat, string> = { path: pathLabel, record: recordLabel }
  const alternateFormat: CopyFormat = format === 'path' ? 'record' : 'path'

  return (
    <div ref={rootRef} className={cn('inline-flex shrink-0 items-center', className)}>
      {status === 'copied' ? (
        <div
          data-id={dataId}
          role="group"
          aria-label="Copy format"
          aria-live="polite"
          className="inline-flex h-6 items-center gap-0.5 rounded-lg bg-muted p-0.5"
        >
          <button
            type="button"
            data-copy-format={format}
            aria-label={`Copied ${names[format]}`}
            aria-pressed="true"
            disabled={copying}
            className="inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-md bg-card px-1.5 text-xs font-medium text-foreground shadow-sm transition-[background-color,color,box-shadow] disabled:opacity-50"
            onClick={(event) => {
              event.stopPropagation()
              void copy(format)
            }}
          >
            <span>Copied</span>
            <span ref={selectedLabel}>{names[format]}</span>
          </button>
          <button
            type="button"
            data-copy-format={alternateFormat}
            aria-label={`Copy ${names[alternateFormat]}`}
            aria-pressed="false"
            disabled={copying}
            className="inline-flex h-5 items-center whitespace-nowrap rounded-md px-1.5 text-xs font-normal text-muted-foreground/65 transition-colors hover:text-foreground disabled:opacity-50"
            onClick={(event) => {
              event.stopPropagation()
              void copy(alternateFormat)
            }}
          >
            <span ref={alternateLabel}>{`${names[alternateFormat].charAt(0).toUpperCase()}${names[alternateFormat].slice(1)}`}</span>
          </button>
        </div>
      ) : (
        <InlineFeedbackAction
          dataId={dataId}
          disabled={copying}
          feedback={status === 'error' ? 'Could not copy' : undefined}
          icon={<Copy className="h-3.5 w-3.5" />}
          label={label}
          onClick={(event) => {
            event.stopPropagation()
            void copy('path')
          }}
          tone={status === 'error' ? 'destructive' : tone}
        />
      )}
    </div>
  )
}
