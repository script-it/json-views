import { useJsonViewsPortalContainer } from '../surface.js'
import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'

import { cn } from '../lib/cn.js'

const TooltipProvider = TooltipPrimitive.Provider

const Tooltip = TooltipPrimitive.Root

/**
 * Radix opens a tooltip on *any* focus, including the programmatic focus a
 * dialog or popover moves onto its first focusable child when it mounts —
 * which pops a tooltip the user never pointed at. Gate that to keyboard focus:
 * Radix composes its own focus handler behind this one and skips it once
 * default is prevented, so hover and real keyboard tabbing still open normally.
 */
const TooltipTrigger = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Trigger>
>(({ onFocus, ...props }, ref) => (
  <TooltipPrimitive.Trigger
    ref={ref}
    onFocus={(event) => {
      onFocus?.(event)
      if (!event.defaultPrevented && !event.currentTarget.matches(':focus-visible')) {
        event.preventDefault()
      }
    }}
    {...props}
  />
))
TooltipTrigger.displayName = TooltipPrimitive.Trigger.displayName

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => {
  const portalContainer = useJsonViewsPortalContainer()
  return (
  <TooltipPrimitive.Portal container={portalContainer}>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        // Top of the overlay ladder (slide panels 60/70, dialog 80/90, menus
        // 100). The content portals to `body`, so a lower value paints behind
        // whichever surface holds the trigger.
        'z-[110] overflow-hidden rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-foreground shadow-lg',
        'animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
        'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
        className
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
  )
})
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export interface ConditionalTooltipProps {
  enabled?: boolean
  label: React.ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  /** Cross-axis alignment of the tooltip against the trigger. `'start'`
   *  left-aligns the tooltip to the trigger when `side` is `'top'`/`'bottom'`. */
  align?: 'start' | 'center' | 'end'
  /** Pixel offset along the alignment axis. With `align="start"` on a
   *  `'top'`/`'bottom'` side, a negative value nudges the tooltip left. */
  alignOffset?: number
  /** Open delay in ms. Omit to inherit the provider default; pass `0` for an
   *  instant tooltip on hover/focus. */
  delayDuration?: number
  tooltipClassName?: string
  children: React.ReactElement
}

export function ConditionalTooltip({
  enabled = true,
  label,
  side = 'bottom',
  align,
  alignOffset,
  delayDuration,
  tooltipClassName,
  children,
}: ConditionalTooltipProps) {
  if (!enabled) {
    return children
  }

  return (
    <Tooltip delayDuration={delayDuration}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} align={align} alignOffset={alignOffset} className={tooltipClassName}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
