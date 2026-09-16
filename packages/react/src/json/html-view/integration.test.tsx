import { TooltipProvider } from '../../primitives/tooltip.js'
// @vitest-environment jsdom
import { act } from 'react'
import { expect, it, vi } from 'vitest'
import { JSONContent } from '../json-content.js'
import { renderComponent } from '../../test/render.js'

it('interprets an arbitrary embedded template and preserves source through the real save pipeline', async () => {
  const metadata = { version: 1, views: [{ name: 'Custom', path: '$', display: 'html', html: '<h1><jv-field bind="$.name"></jv-field></h1><input type="checkbox" jv-bind="$.done" aria-label="Done"><jv-repeat source="$.rows" as="row" key="id"><p><jv-value bind="row.label"></jv-value></p></jv-repeat>', css: 'h1 { font-size: 30px; }' }] }
  const source = '{\n  "name" : "Original",\n  "done" : false,\n  "rows": [{"id":"a","label":"First"}],\n  "$jsonviews": '+JSON.stringify(metadata)+'\n}'
  const save = vi.fn(async (_content: string) => {})
  const rendered = await renderComponent(<JSONContent content={source} documentId="html" onSave={save} />)
  try {
    const frame = rendered.container.querySelector('iframe')!
    // jsdom does not load srcdoc: provide only the trusted mount skeleton.
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
    const doc = frame.contentDocument!
    await act(async () => { doc.body.innerHTML = '<div id="mount"></div>'; frame.dispatchEvent(new Event('load')) })
    await act(async () => { rendered.root.render(<TooltipProvider><JSONContent content={source} documentId="html" revision="one" onSave={save} /></TooltipProvider>) })
    expect(doc.body.textContent).toContain('Original'); expect(doc.body.textContent).toContain('First')
    await act(async () => { (doc.querySelector('input') as HTMLInputElement).click() })
    expect(save).toHaveBeenCalledTimes(1)
    const saved = save.mock.calls[0][0] as string
    expect(saved).toContain('"done" : true'); expect(saved).toContain('"name" : "Original"')
    expect(JSON.parse(saved).$jsonviews).toEqual(metadata)
    expect(doc.head.textContent).toContain('font-size: 30px')
  } finally { await rendered.cleanup() }
})

it('opens a bound field in a control that fits its value', async () => {
  const metadata = { version: 1, views: [{ name: 'Custom', path: '$', display: 'html', html: '<p><jv-field bind="$.short"></jv-field></p><p><jv-field bind="$.long"></jv-field></p>' }] }
  const source = '{\n  "short": "Ready",\n  "long": ' + JSON.stringify('word '.repeat(40).trim()) + ',\n  "$jsonviews": ' + JSON.stringify(metadata) + '\n}'
  const save = vi.fn(async (_content: string) => {})
  const rendered = await renderComponent(<JSONContent content={source} documentId="html-editor" onSave={save} />)
  try {
    const frame = rendered.container.querySelector('iframe')!
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
    const doc = frame.contentDocument!
    await act(async () => { doc.body.innerHTML = '<div id="mount"></div>'; frame.dispatchEvent(new Event('load')) })
    await act(async () => { rendered.root.render(<TooltipProvider><JSONContent content={source} documentId="html-editor" revision="one" onSave={save} /></TooltipProvider>) })
    const fields = () => [...doc.querySelectorAll('button.jv-field')] as HTMLButtonElement[]
    await act(async () => { fields()[1].click() })
    // A value past one line edits in the resizable textarea, not a single line.
    expect(document.querySelector('[data-anchored-popup] textarea')).not.toBeNull()
    await act(async () => { fields()[0].click() })
    expect(document.querySelector('[data-anchored-popup] textarea')).toBeNull()
    expect((document.querySelector('[data-anchored-popup] input') as HTMLInputElement).value).toBe('Ready')
  } finally { await rendered.cleanup() }
})
