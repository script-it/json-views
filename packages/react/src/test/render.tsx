/**
 * Minimal render harness for the package's own jsdom component tests.
 *
 * The package can't reach the app's `renderWithProviders`, and it needs far
 * less: no React Query, no router — only a `TooltipProvider`, which several
 * composites require. Hand-rolled on `react-dom/client` + `act` to avoid a
 * testing-library dependency.
 */

import { act } from 'react'
import type { ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { TooltipProvider } from '../primitives/tooltip.js'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// jsdom implements no layout, so `Element.scrollIntoView` is absent. Components
// that scroll into view on mount would throw; a no-op keeps those effects inert.
if (typeof Element !== 'undefined' && typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = () => {}
}

// CodeMirror measures DOM ranges to position the caret and viewport. jsdom has
// Range, but not its layout methods, so return empty geometry in component tests.
if (typeof Range !== 'undefined' && typeof Range.prototype.getClientRects !== 'function') {
  Range.prototype.getClientRects = () => ({
    length: 0,
    item: () => null,
    [Symbol.iterator]: function* () {},
  }) as DOMRectList
}
if (typeof Range !== 'undefined' && typeof Range.prototype.getBoundingClientRect !== 'function') {
  Range.prototype.getBoundingClientRect = () => new DOMRect()
}

// Same gap, one layer up: jsdom has no `matchMedia`, and any composite reaching
// for `useIsMobile` subscribes to one. Report "not mobile" and never change,
// which is the desktop layout these tests assert against.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

export interface RenderResult {
  container: HTMLDivElement
  root: Root
  cleanup: () => Promise<void>
}

export async function renderComponent(element: ReactElement): Promise<RenderResult> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  await act(async () => {
    root.render(<TooltipProvider>{element}</TooltipProvider>)
    await Promise.resolve()
  })

  return {
    container,
    root,
    cleanup: async () => {
      await act(async () => {
        root.unmount()
        await Promise.resolve()
      })
      container.remove()
    },
  }
}
