// @vitest-environment jsdom
import { act } from 'react'
import { afterEach, expect, it } from 'vitest'
import { renderComponent, type RenderResult } from '../test/render.js'
import { TooltipProvider } from '../primitives/tooltip.js'
import { ViewSaveStatus } from './view-save-status.js'
let rendered: RenderResult | undefined
afterEach(async () => { await rendered?.cleanup() })
it.each([
  [false, false, undefined, 'Data is saved, but this is not valid JSON.'],
  [true, false, undefined, 'Invalid JSON. Changes are not saved.'],
  [true, true, undefined, 'Saving…'],
  [false, false, 'Disk full', 'Changes are not saved.'],
])('distinguishes invalid source from save progress (%s, %s, %s)', async (dirty, saving, error, label) => {
  rendered = await renderComponent(<TooltipProvider><ViewSaveStatus embedded={false} objectRoot={false}
    dirty={dirty} saving={saving} error={error} invalidFormat="JSON" invalidSourceError="Expected a property name at position 2" onSave={async () => {}} /></TooltipProvider>)
  const status = rendered.container.querySelector('button')
  expect(status?.getAttribute('aria-label')).toBe(`${label} Click for details.`)
  expect(status?.classList.contains('text-red-400')).toBe(true)
  await act(async () => { status?.click() })
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Expected a property name at position 2')
})
