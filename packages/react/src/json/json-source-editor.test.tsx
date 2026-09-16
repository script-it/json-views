// @vitest-environment jsdom

import { act } from 'react'
import { foldCode, foldedRanges } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { JsonViewsDeviceProvider } from '../browser-device.js'
import { TooltipProvider } from '../primitives/tooltip.js'
import { renderComponent, type RenderResult } from '../test/render.js'
import { JSONContent } from './json-content.js'
import { SourceEditor, sourceTargetDecorations } from './json-source-editor.js'

let rendered: RenderResult | undefined

afterEach(async () => {
  await rendered?.cleanup()
  rendered = undefined
  vi.restoreAllMocks()
})

const content = '{\n  "profile": {\n    "name": "Ada",\n    "active": true\n  }\n}'
const props = {
  content,
  dirty: false,
  fillHeight: true,
  format: 'JSON',
  onChange: () => {},
  onClose: () => {},
  readOnly: false,
  saving: false,
}

function editor(): EditorView {
  const dom = rendered?.container.querySelector<HTMLElement>('[data-id="jsonView-source-editor"]')
  const view = dom ? EditorView.findFromDOM(dom) : null
  if (!view) throw new Error('Expected CodeMirror source editor')
  return view
}

function targetRanges(view = editor()): Array<{ from: number; to: number }> {
  const ranges: Array<{ from: number; to: number }> = []
  view.state.field(sourceTargetDecorations).between(0, view.state.doc.length, (from, to) => ranges.push({ from, to }))
  return ranges
}

describe('CodeMirror source editor', () => {
  it('returns to Views from a left-aligned source toolbar action', async () => {
    const onClose = vi.fn()
    rendered = await renderComponent(<SourceEditor {...props} onClose={onClose} />)

    const views = rendered.container.querySelector<HTMLButtonElement>('[data-id="jsonView-source-views"]')
    expect(views?.textContent).toContain('Views')
    expect(views?.classList).toContain('mr-auto')
    await act(async () => { views?.click() })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('keeps a small gap unless a source error needs a row', async () => {
    rendered = await renderComponent(<SourceEditor {...props} />)
    const errorRow = rendered.container.querySelector('[data-id="jsonView-source-error"]')
    expect(errorRow).toBeNull()

    await act(async () => {
      rendered!.root.render(<TooltipProvider><SourceEditor {...props} invalidSourceError="Expected a value" /></TooltipProvider>)
    })
    const visibleError = rendered.container.querySelector('[data-id="jsonView-source-error"]')
    expect(visibleError?.getAttribute('role')).toBe('alert')
    expect(visibleError?.classList).toContain('h-6')
    expect(visibleError?.textContent).toBe('Expected a value')
  })

  it('uses one native editor document for rendering and editing', async () => {
    const onChange = vi.fn()
    rendered = await renderComponent(<SourceEditor {...props} onChange={onChange} />)
    const view = editor()

    expect(view.state.doc.toString()).toBe(content)
    expect(rendered.container.querySelector('textarea')).toBeNull()

    await act(async () => {
      view.dispatch({ changes: { from: content.indexOf('Ada'), to: content.indexOf('Ada') + 3, insert: 'Grace' } })
      await Promise.resolve()
    })
    expect(onChange).toHaveBeenLastCalledWith(content.replace('Ada', 'Grace'))
  })

  it('keeps the editor instance during external content updates', async () => {
    rendered = await renderComponent(<SourceEditor {...props} />)
    const view = editor()
    const next = content.replace('Ada', 'Grace')
    view.scrollDOM.scrollTop = 120

    await act(async () => {
      rendered!.root.render(<TooltipProvider><SourceEditor {...props} content={next} /></TooltipProvider>)
      await Promise.resolve()
    })

    expect(editor()).toBe(view)
    expect(view.state.doc.toString()).toBe(next)
    expect(view.scrollDOM.scrollTop).toBe(120)
  })

  it('highlights the requested source range and dismisses it on any click', async () => {
    const start = content.indexOf('{', content.indexOf('"profile"'))
    const end = content.lastIndexOf('}')
    rendered = await renderComponent(<SourceEditor {...props} targetRanges={[{ start, end }]} />)

    expect(targetRanges()).toEqual([{ from: start, to: end }])
    expect(JSON.parse(content.slice(start, end))).toEqual({ name: 'Ada', active: true })

    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
    await act(async () => {
      editor().dom.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
      await Promise.resolve()
    })
    expect(targetRanges()).toEqual([])
  })

  it('reveals the first target after the editor mounts', async () => {
    const start = content.indexOf('"active"')
    vi.spyOn(EditorView.prototype, 'lineBlockAt').mockReturnValue({
      from: start,
      length: 8,
      top: 240,
      height: 20,
      bottom: 260,
    } as ReturnType<EditorView['lineBlockAt']>)
    rendered = await renderComponent(<SourceEditor {...props} targetRanges={[{ start, end: start + 8 }]} />)

    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
    expect(editor().scrollDOM.scrollTop).toBe(240)
  })

  it('uses CodeMirror read-only state', async () => {
    rendered = await renderComponent(<SourceEditor {...props} readOnly />)
    expect(editor().state.readOnly).toBe(true)
    expect(editor().contentDOM.getAttribute('contenteditable')).toBe('false')
  })

  it('enables JSON property folding', async () => {
    rendered = await renderComponent(<SourceEditor {...props} />)
    const view = editor()
    const profileLine = view.state.doc.line(2)
    view.dispatch({ selection: { anchor: profileLine.from } })

    expect(foldCode(view)).toBe(true)
    expect(foldedRanges(view.state).size).toBeGreaterThan(0)
  })

  it('optically centers fold chevrons within their editor line', async () => {
    rendered = await renderComponent(<SourceEditor {...props} />)
    const marker = rendered.container.querySelector<HTMLElement>('.cm-foldGutter [title="Fold line"]')

    expect(marker).not.toBeNull()
    expect(getComputedStyle(marker!).display).toBe('inline-flex')
    expect(getComputedStyle(marker!).transform).toBe('translateY(-1px)')
  })

  it.each(['desktop', 'mobile'] as const)('uses a readable source size on %s', async (device) => {
    rendered = await renderComponent(<JsonViewsDeviceProvider device={device}><SourceEditor {...props} /></JsonViewsDeviceProvider>)
    expect(getComputedStyle(editor().dom).fontSize).toBe(device === 'mobile' ? '16px' : '12px')
  })

  it('uses a bright two-pixel caret', async () => {
    rendered = await renderComponent(<SourceEditor {...props} />)
    const cursorRule = Array.from(document.querySelectorAll('style')).map((style) => style.textContent).find((text) => text?.includes('.cm-cursor'))
    expect(cursorRule).toContain('border-left-color: var(--jv-foreground) !important')
    expect(cursorRule).toContain('border-left-width: 2px !important')
  })
})

 it('forces invalid JSON into the shared editor until repaired', async () => {
    rendered = await renderComponent(<JSONContent content="{broken" />)
    const views = () => rendered!.container.querySelector<HTMLButtonElement>('[data-id="jsonView-source-views"], [data-id="jsonView-json-tab-root"]')!
    expect(views().disabled).toBe(true)
    expect(rendered.container.querySelector<HTMLButtonElement>('[data-id="jsonView-source-toggle"]')?.disabled).toBe(true)
    expect(rendered.container.querySelector('[data-id="jsonView-source-error"]')).toBeNull()
    await act(async () => { views().dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); views().click() })
    expect(rendered.container.querySelector('[data-id="jsonView-source-editor"]')).not.toBeNull()
    await act(async () => { rendered!.root.render(<TooltipProvider><JSONContent content='{"fixed":true}' /></TooltipProvider>) })
    expect(views().disabled).toBe(false)
    await act(async () => { views().dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); views().click() })
    expect(rendered.container.querySelector('[data-id="jsonView-source-editor"]')).toBeNull()
  })
