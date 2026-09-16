import { TooltipProvider } from '../../primitives/tooltip.js'
// @vitest-environment jsdom
import { act } from 'react'
import { expect, it, vi } from 'vitest'
import { renderComponent } from '../../test/render.js'
import { EditBaseContext } from '../../structured-data/edit-base.js'
import { NativeHtmlControl } from './native-control.js'
import type { JsonViewJsonEditing } from '../view-types.js'
it('commits typed numeric values once and refuses stale draft paths', async () => {
  const replace = vi.fn(async () => {}), report = vi.fn()
  const editing = { replace, saving: false } as unknown as JsonViewJsonEditing
  const control = (base: string, path = ['stock']) => <EditBaseContext.Provider value={base}><NativeHtmlControl tag="input" props={{ type: 'number' }} path={path} value={12} editing={editing} report={report} /></EditBaseContext.Provider>
  const rendered = await renderComponent(control('one'))
  try {
    const input = rendered.container.querySelector('input')!
    await act(async () => { input.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '15'); input.dispatchEvent(new Event('input', { bubbles: true })) })
    await act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })
    expect(replace).toHaveBeenCalledWith(['stock'], 15)
    await act(async () => { input.blur(); input.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '16'); input.dispatchEvent(new Event('input', { bubbles: true })) })
    await act(async () => { rendered.root.render(<TooltipProvider>{control('two', ['other'])}</TooltipProvider>) })
    await act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })
    expect(replace).toHaveBeenCalledTimes(1); expect(report).toHaveBeenCalledWith(expect.stringContaining('changed outside'))
  } finally { await rendered.cleanup() }
})

it('keeps an unrelated control enabled while another HTML control saves', async () => {
  let finishSave!: () => void
  const replace = vi.fn(() => new Promise<void>(resolve => { finishSave = resolve }))
  const editing = { replace, saving: false } as unknown as JsonViewJsonEditing
  const controls = (saving: boolean) => <EditBaseContext.Provider value="one">
    <NativeHtmlControl tag="input" props={{ type: 'checkbox' }} path={['first']} value={false} editing={{ ...editing, saving }} report={vi.fn()} />
    <NativeHtmlControl tag="input" props={{ type: 'checkbox' }} path={['second']} value={false} editing={{ ...editing, saving }} report={vi.fn()} />
  </EditBaseContext.Provider>
  const rendered = await renderComponent(controls(false))
  try {
    const [first, second] = [...rendered.container.querySelectorAll('input')]
    await act(async () => { first.click() })
    expect(replace).toHaveBeenCalledWith(['first'], true)
    expect(first.disabled).toBe(true)
    await act(async () => { rendered.root.render(<TooltipProvider>{controls(true)}</TooltipProvider>) })
    expect(second.disabled).toBe(false)
    await act(async () => { finishSave() })
    expect(first.disabled).toBe(false)
  } finally { await rendered.cleanup() }
})
