// @vitest-environment jsdom

import { act } from 'react'
import { afterEach, expect, it } from 'vitest'
import { compileJsonViewMetadata } from '@script-it/json-views-core'
import { renderComponent, type RenderResult } from '../test/render.js'
import { Diagnostics } from './view-diagnostics.js'

let rendered: RenderResult | undefined
afterEach(async () => { await rendered?.cleanup(); rendered = undefined })

it('keeps repair help collapsed until requested and exposes every affected path', async () => {
  const compiled = compileJsonViewMetadata({
    rows: [{ url: 'bad1' }, { url: 'bad2' }, { url: 'bad3' }],
    $jsonviews: { version: 1, schema: { '$.rows[*].url': { type: 'url' } } },
  })
  rendered = await renderComponent(<Diagnostics compiled={compiled} />)
  const control = rendered.container.querySelector('details')!
  expect(control.open).toBe(false)
  expect(control.querySelector('summary')?.getAttribute('aria-label')).toBe('1 JSON issue')
  await act(async () => { control.querySelector('summary')!.click() })
  expect(control.open).toBe(true)
  const repair = control.querySelector('details')!
  expect(repair.open).toBe(false)
  await act(async () => { repair.querySelector('summary')!.click() })
  expect(repair.open).toBe(true)
  expect(repair.textContent).toContain('absolute http:// or https:// URL string')
  expect(repair.textContent).toContain('$.rows[2].url: "bad3"')
  expect(repair.textContent).toContain('https://example.com')
})

it('does not merge distinct failures from the same field or hide their repairs', async () => {
  const compiled = compileJsonViewMetadata({ rows: [{ x: -1 }, { x: 11 }, { x: 'wrong' }] }, undefined, { metadata: {
    version: 1, schema: { '$.rows[*].x': { type: 'number', minimum: 0, maximum: 10 } },
  } })
  rendered = await renderComponent(<Diagnostics compiled={compiled} />)
  expect(rendered.container.querySelector('summary')?.getAttribute('aria-label')).toBe('3 JSON issues')
  expect(rendered.container.textContent).toContain('at least 0')
  expect(rendered.container.textContent).toContain('at most 10')
  expect(rendered.container.textContent).toContain('finite number')
  expect(rendered.container.textContent).toContain('External annotations:')
})
