import type { MouseEvent, ReactNode } from 'react'
import { cn } from '../lib/cn.js'

export function InlineFeedbackAction({
  ariaLabel,
  className,
  dataId,
  disabled = false,
  feedback,
  icon,
  label,
  onClick,
  tone = 'default',
  title,
}: {
  ariaLabel?: string
  className?: string
  dataId?: string
  disabled?: boolean
  feedback?: string
  icon: ReactNode
  label: string
  onClick: (event: MouseEvent<HTMLButtonElement>) => void
  tone?: 'default' | 'strong' | 'destructive'
  title?: string
}) {
  const showingFeedback = Boolean(feedback)

  return (
    <button
      type="button"
      data-id={dataId}
      data-feedback-active={showingFeedback ? 'true' : 'false'}
      aria-label={ariaLabel ?? (showingFeedback ? feedback : label)}
      aria-live="polite"
      title={title ?? (showingFeedback ? feedback : label)}
      disabled={disabled}
      className={cn(
        'json-views-inline-feedback-action',
        showingFeedback && 'is-feedback',
        tone === 'strong' && 'is-strong',
        tone === 'destructive' && 'is-destructive',
        className,
      )}
      onClick={onClick}
    >
      {icon}
      <span className="json-views-inline-feedback-label">{feedback}</span>
    </button>
  )
}
