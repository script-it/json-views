// @vitest-environment jsdom
import { act } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { JsonViewsSurface } from '../surface.js'
import { TabularObjectArrayView } from '../tabular-data-view.js'
import { renderComponent, type RenderResult } from '../test/render.js'

let rendered: RenderResult | undefined
afterEach(async () => { await rendered?.cleanup(); rendered = undefined; vi.restoreAllMocks() })

async function click(element: Element | null) {
  if (!(element instanceof HTMLElement)) throw new Error('Missing control')
  await act(async () => element.click())
}

function ContainedTable() {
  return <div style={{ contain: 'layout paint', overflow: 'hidden' }}>
    <JsonViewsSurface theme="dark">
      <TabularObjectArrayView
        arr={[{ name: 'Ada' }]}
        columns={['name']}
        viewStateKey="contained-table"
        onOpenCell={() => {}}
        onColumnRename={() => {}}
        onAddColumn={() => {}}
      />
    </JsonViewsSurface>
  </div>
}

it('opens column options outside a containing table host with its viewer theme and usable inputs', async () => {
  rendered = await renderComponent(<ContainedTable />)
  const trigger = rendered.container.querySelector('[data-id="tabular-column-menu"]')
  if (!(trigger instanceof HTMLElement)) throw new Error('Missing column title')
  vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(new DOMRect(600, 400, 200, 36))
  await click(trigger)

  const menu = document.querySelector<HTMLElement>('[role="menu"]')
  expect(menu).not.toBeNull()
  expect(rendered.container.contains(menu)).toBe(false)
  expect(menu?.parentElement?.matches('.json-views-root[data-json-views-portal]')).toBe(true)
  expect(menu?.parentElement?.dataset.jsonViewsTheme).toBe('dark')
  expect(menu?.style.position).toBe('fixed')
  expect(menu?.style.left).toBe('600px')
  expect(menu?.style.top).toBe('440px')

  const input = menu?.querySelector<HTMLInputElement>('input[aria-label="Rename name"]')
  if (!input) throw new Error('Missing rename input')
  await act(async () => {
    input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    input.focus()
  })
  expect(document.activeElement).toBe(input)
  expect(trigger.getAttribute('aria-expanded')).toBe('true')
  await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  expect(document.querySelector('[role="menu"]')).toBeNull()
  expect(trigger.getAttribute('aria-expanded')).toBe('false')
})

it('opens add property outside the containing table host and focuses its themed form', async () => {
  rendered = await renderComponent(<ContainedTable />)
  await click(rendered.container.querySelector('[data-id="tabular-add-column"]'))
  const form = document.querySelector<HTMLFormElement>('form[aria-label="Add property"]')
  expect(form).not.toBeNull()
  expect(rendered.container.contains(form)).toBe(false)
  expect(form?.parentElement?.matches('.json-views-root[data-json-views-portal]')).toBe(true)
  expect(form?.parentElement?.dataset.jsonViewsTheme).toBe('dark')
  expect(document.activeElement).toBe(form?.querySelector('input'))
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  expect(document.querySelector('form[aria-label="Add property"]')).toBeNull()
})

it('flips column options above a bottom-edge title and repositions when its content grows', async () => {
  let anchorTop = window.innerHeight - 38
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.dataset.id === 'tabular-column-menu') return new DOMRect(600, anchorTop, 200, 36)
    if (this.getAttribute('role') === 'menu') return new DOMRect(0, 0, 240, this.querySelector('[data-id="tabular-apply-filter"]') ? 320 : 180)
    return new DOMRect()
  })
  rendered = await renderComponent(<ContainedTable />)
  await click(rendered.container.querySelector('[data-id="tabular-column-menu"]'))
  const menu = document.querySelector<HTMLElement>('[role="menu"]')!
  expect(menu.style.top).toBe(`${anchorTop - 184}px`)
  await click(menu.querySelector('[data-id="tabular-filter-column"]'))
  expect(menu.style.top).toBe(`${anchorTop - 324}px`)
  anchorTop = 30
  await act(async () => window.dispatchEvent(new Event('scroll')))
  expect(menu.style.top).toBe('70px')
})

it('keeps a sort flyout inside the right and bottom viewport edges', async () => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.dataset.id === 'tabular-column-menu') return new DOMRect(window.innerWidth - 220, window.innerHeight - 38, 200, 36)
    if (this.dataset.id === 'tabular-sort-column') return new DOMRect(window.innerWidth - 248, window.innerHeight - 70, 220, 30)
    if (this.getAttribute('aria-label') === 'Sort name') return new DOMRect(0, 0, 208, 100)
    if (this.getAttribute('role') === 'menu') return new DOMRect(0, 0, 240, 180)
    return new DOMRect()
  })
  rendered = await renderComponent(<ContainedTable />)
  await click(rendered.container.querySelector('[data-id="tabular-column-menu"]'))
  await click(document.querySelector('[data-id="tabular-sort-column"]'))
  const submenu = document.querySelector<HTMLElement>('[role="menu"][aria-label="Sort name"]')!
  expect(submenu.style.left).toBe(`${window.innerWidth - 460}px`)
  expect(submenu.style.top).toBe(`${window.innerHeight - 108}px`)
  expect(submenu.style.position).toBe('fixed')
})

it('flips the add-property form and constrains oversized content to the viewport', async () => {
  let formHeight = 250
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.dataset.id === 'tabular-add-column') return new DOMRect(window.innerWidth - 30, window.innerHeight - 38, 20, 36)
    if (this.getAttribute('aria-label') === 'Add property') return new DOMRect(0, 0, 256, formHeight)
    return new DOMRect()
  })
  rendered = await renderComponent(<ContainedTable />)
  await click(rendered.container.querySelector('[data-id="tabular-add-column"]'))
  const form = document.querySelector<HTMLFormElement>('form[aria-label="Add property"]')!
  expect(form.style.left).toBe(`${window.innerWidth - 264}px`)
  expect(form.style.top).toBe(`${window.innerHeight - 292}px`)
  formHeight = window.innerHeight + 100
  await act(async () => window.dispatchEvent(new Event('resize')))
  expect(form.style.top).toBe('8px')
  expect(form.style.maxHeight).toBe('calc(100vh - 16px)')
  expect(form.style.overflowY).toBe('auto')
})
