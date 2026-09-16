// @vitest-environment jsdom
import { act } from 'react'
import { expect, it, vi } from 'vitest'
import { JSONContent } from '../json-content.js'
import { renderComponent } from '../../test/render.js'

it('previews and applies HTML settings without stripping the template or rewriting data', async () => {
  const declaration = { id: 'custom', name: 'Custom', path: '$', display: 'html', html: '<h1><jv-value bind="$.name"></jv-value></h1>', css: 'h1 { color: green; }' }
  const value = { name: 'Original', $jsonviews: { version: 1, views: [declaration] } }
  const save = vi.fn(async (_content: string) => {})
  const rendered = await renderComponent(<JSONContent content={JSON.stringify(value)} documentId="html-settings" onSave={save} />)
  try {
    await act(async () => { rendered.container.querySelector<HTMLButtonElement>('[aria-label="View options"]')!.click() })
    const menu = document.querySelector('[aria-label="HTML view options"]')!
    expect(menu.getAttribute('data-id')).toBe('view-settings')
    expect(menu.className).toContain('w-[min(26rem,calc(100vw-2rem))]')
    expect(menu.querySelector('h3')?.textContent).toBe('View options')
    const name = menu.querySelector<HTMLInputElement>('[aria-label="View name"]')!
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(name, 'Renamed'); name.dispatchEvent(new Event('input', { bubbles: true })) })
    const button = (label: string) => Array.from(menu.querySelectorAll('button')).find(b => b.textContent === label)!
    await act(async () => { button('Preview').click() })
    expect(save).not.toHaveBeenCalled()
    await act(async () => { button('Save view').click() })
    expect(save).toHaveBeenCalledTimes(1)
    const saved = JSON.parse(save.mock.calls[0][0])
    expect(saved.name).toBe('Original'); expect(saved.$jsonviews.views[0]).toEqual({ ...declaration, name: 'Renamed' })
  } finally { await rendered.cleanup() }
})
