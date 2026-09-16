// @vitest-environment jsdom
import { useRef } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { renderComponent, type RenderResult } from '../test/render.js'
import { useAnchoredPosition } from './use-anchored-position.js'

function rect(width: number): DOMRect {
  return { x: 0, y: 0, left: 0, right: width, top: 0, bottom: 20, width, height: 20, toJSON: () => ({}) } as DOMRect
}

function Anchored({ anchorWidth, matchAnchorWidth }: { anchorWidth: number; matchAnchorWidth: boolean }) {
  const anchor = useRef<HTMLSpanElement | null>(null)
  const content = useRef<HTMLDivElement | null>(null)
  const position = useAnchoredPosition(true, anchor, content, 'bottom', 'start', matchAnchorWidth)
  return <>
    <span ref={anchor} data-id="anchor" data-width={anchorWidth}>value</span>
    <div ref={content} data-id="content" style={position}>editor</div>
  </>
}

let rendered: RenderResult | undefined
afterEach(async () => { await rendered?.cleanup(); rendered = undefined; vi.restoreAllMocks() })

async function minWidthOf(anchorWidth: number, matchAnchorWidth: boolean): Promise<string> {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    return rect(Number(this.getAttribute('data-width') ?? 320))
  })
  rendered = await renderComponent(<Anchored anchorWidth={anchorWidth} matchAnchorWidth={matchAnchorWidth} />)
  return (document.querySelector('[data-id="content"]') as HTMLElement).style.minWidth
}

it('floors a matching popover at the anchor width so an editor covers the value it replaces', async () => {
  expect(await minWidthOf(640, true)).toBe('640px')
})

it('keeps the viewport, not the anchor, as the upper bound', async () => {
  // jsdom reports a 1024px viewport; 8px of padding is reserved on each side.
  expect(await minWidthOf(4000, true)).toBe('1008px')
})

it('leaves width to the caller when matching is off', async () => {
  expect(await minWidthOf(640, false)).toBe('')
})
