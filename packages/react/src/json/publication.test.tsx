// @vitest-environment jsdom
import { act, memo } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDefaultTypeRegistry } from '@script-it/json-views-core'
import { renderComponent, type RenderResult } from '../test/render.js'
import { JsonViewsProvider, createDefaultWidgetRegistry, useJsonViewsRegistries, type JsonViewEditWidgetProps } from '../widget-registry.js'
import { TooltipProvider } from '../primitives/tooltip.js'
import { JSONContent } from './json-content.js'
import { JsonViewSchemaValueCell, JsonViewSchemaValueDisplay } from './schema-value.js'

let rendered: RenderResult | undefined
afterEach(async () => { await rendered?.cleanup(); rendered = undefined; vi.restoreAllMocks(); localStorage.clear() })
const edit = (onCommitContent = vi.fn(async (_source: string) => {})) => ({ isEditing: false, editContent: '', onEditChange: () => {}, onCommitContent })
async function click(element: Element | null) {
  if (!(element instanceof HTMLElement)) throw new Error('Missing control')
  await act(async () => element.click())
}
async function fill(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new InputEvent('input', { bubbles: true }))
  })
}
const schemaProps = { label: 'Location', onOpen: () => {}, value: { lat: 1, lon: 2 } }

describe('publication regressions', () => {
  it('keeps equal-ranked Kanban cards in source order', async () => {
    const content = JSON.stringify({ rows: [{ name: 'Ada', status: 'new', rank: 0 }, { name: 'Grace', status: 'new', rank: 0 }], $jsonviews: {
      version: 1, views: [{ name: 'Board', path: '$.rows', display: 'kanban', groupBy: '$.rows[*].status', orderPath: '$.rows[*].rank' }],
    } })
    rendered = await renderComponent(<JSONContent content={content} />)
    const cards = Array.from(rendered.container.querySelectorAll('[data-id="jsonView-kanban-card"]'))
    expect(cards[0].textContent).toContain('Ada')
    expect(cards[1].textContent).toContain('Grace')
  })
  it('supports memoized plugin editors', async () => {
    const widgets = createDefaultWidgetRegistry().register('text', memo((props: JsonViewEditWidgetProps) => <button onClick={() => props.onCommit('Updated')}>Memo editor</button>))
    const saved = vi.fn(async (_source: string) => {})
    rendered = await renderComponent(<JsonViewsProvider widgets={widgets}><JSONContent content='{"name":"Ada"}' onSave={saved} /></JsonViewsProvider>)
    await click(rendered.container.querySelector('[aria-label="Edit Name"]'))
    await click(Array.from(rendered.container.querySelectorAll('button')).find((button) => button.textContent === 'Memo editor') ?? null)
    expect(saved).toHaveBeenCalledWith('{"name":"Updated"}', expect.any(Object))
  })

  it('supports keyboard Kanban movement and validates its schema before saving', async () => {
    const saved = vi.fn(async (_source: string) => {})
    const content = JSON.stringify({ rows: [{ name: 'Ada', status: 'new' }, { name: 'Grace', status: null }], $jsonviews: {
      version: 1, schema: { '$.rows[*].status': { type: 'select', options: ['new', 'done'], required: true } },
      views: [{ name: 'Board', path: '$.rows', display: 'kanban', groupOrder: ['new', 'done'], groupBy: '$.rows[*].status' }],
    } })
    rendered = await renderComponent(<JSONContent content={content} onSave={saved} />)
    await act(async () => rendered!.container.querySelector('[aria-label="Reorder Ada"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })))
    expect(JSON.parse(saved.mock.calls[0][0]).rows[0].status).toBe('done')
    await act(async () => rendered!.container.querySelector('[aria-label="Reorder Ada"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })))
    expect(saved).toHaveBeenCalledTimes(1)
    expect(rendered.container.textContent).toContain('A value is required')
  })
  it('keeps provider defaults independent when a plugin is registered at runtime', async () => {
    function PluginHost() {
      const { widgets } = useJsonViewsRegistries()
      return <button onClick={() => widgets.register('text', { editor: () => null, display: () => <span>Custom display</span> })}>Register plugin</button>
    }
    rendered = await renderComponent(<>
      <JsonViewsProvider><PluginHost /><JsonViewSchemaValueDisplay descriptor={{ type: 'text' }} value="First" onOpen={() => {}} /></JsonViewsProvider>
      <JsonViewsProvider><JsonViewSchemaValueDisplay descriptor={{ type: 'text' }} value="Second" onOpen={() => {}} /></JsonViewsProvider>
    </>)
    await click(rendered.container.querySelector('button'))
    expect(rendered.container.textContent).toContain('Custom display')
    expect(rendered.container.textContent).toContain('Second')
  })

  it('never restores another viewer instance navigation even with the same document id', async () => {
    const content = '{"profile":{"name":"Ada"}}'
    const viewer = <JSONContent documentId="shared-file" content={content} metadata={{ version: 1 }} />
    rendered = await renderComponent(viewer)
    const term = Array.from(rendered.container.querySelectorAll('dt')).find((term) => term.textContent === 'profile')
    await click(term?.nextElementSibling?.querySelector('[aria-label="Open nested value"]') ?? null)
    expect(rendered.container.querySelector('button[title="Back"]')).not.toBeNull()
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 210)) })
    await rendered.cleanup()
    rendered = await renderComponent(viewer)
    expect(rendered.container.querySelector('button[title="Back"]')).toBeNull()
    expect(rendered.container.textContent).toContain('profile')
  })
  it('creates dangerous-looking property names as own data without polluting prototypes', async () => {
    const saved = vi.fn(async (_source: string) => {})
    const source = { rows: [], $jsonviews: { version: 1, schema: { '$.rows[*].__proto__.jsonViewsReviewProbe': { type: 'text' } }, views: [{ name: 'Rows', path: '$.rows', columns: [{ label: 'Value', path: '$.rows[*].__proto__.jsonViewsReviewProbe' }] }] } }
    rendered = await renderComponent(<JSONContent documentId="pollution" content={JSON.stringify(source)} edit={edit(saved)} />)
    await click(rendered.container.querySelector('[data-id="tabular-add-row"]'))
    expect(Object.prototype).not.toHaveProperty('jsonViewsReviewProbe')
    const row = JSON.parse(saved.mock.calls[0][0]).rows[0]
    expect(Object.hasOwn(row, '__proto__')).toBe(true)
    expect(row.__proto__.jsonViewsReviewProbe).toBe('')
  })

  it('resets an open draft when document identity changes even for the same display path', async () => {
    const saveA = vi.fn(async (_source: string) => {})
    const saveB = vi.fn(async (_source: string) => {})
    rendered = await renderComponent(<JSONContent documentId="account-a/file" path="file.json" content='{"name":"Alice"}' edit={edit(saveA)} />)
    await click(rendered.container.querySelector('[aria-label="Edit Name"]'))
    await fill(rendered.container.querySelector('input[aria-label="Edit Name"]')!, 'A draft')
    await act(async () => rendered!.root.render(<TooltipProvider><JSONContent documentId="account-b/file" path="file.json" content='{"name":"Bob"}' edit={edit(saveB)} /></TooltipProvider>))
    expect(rendered.container.querySelector('input[aria-label="Edit Name"]')).toBeNull()
    expect(rendered.container.textContent).toContain('Bob')
    expect(saveA).not.toHaveBeenCalled()
    expect(saveB).not.toHaveBeenCalled()
  })

  it('opens registered object editors and applies model conversions before canonical validation', async () => {
    const saved = vi.fn(async (_value: unknown) => {})
    const parse = vi.fn((value: unknown) => (value as { lat: number }).lat)
    const serialize = vi.fn((value: unknown) => ({ lat: Number(value), lon: 2 }))
    const types = createDefaultTypeRegistry().register({ name: 'coordinate', parse, serialize, validate: (value) => typeof (value as { lat: number }).lat === 'number' ? undefined : 'Invalid coordinate' })
    const widgets = createDefaultWidgetRegistry().register('coordinate', (props) => <button onClick={() => props.onCommit(9)}>Use coordinate {String(props.value)}</button>)
    rendered = await renderComponent(<JsonViewsProvider types={types} widgets={widgets}><JsonViewSchemaValueCell {...schemaProps} descriptor={{ type: 'coordinate' }} onCommit={saved} /></JsonViewsProvider>)
    await click(rendered.container.querySelector('[data-id="atomic-edit-value"]'))
    expect(rendered.container.textContent).toContain('Use coordinate 1')
    await click(rendered.container.querySelector('[data-id="jsonView-schema-editor"] button'))
    expect(parse).toHaveBeenCalledWith({ lat: 1, lon: 2 }, expect.any(Object))
    expect(serialize).toHaveBeenCalledWith(9, expect.any(Object))
    expect(saved).toHaveBeenCalledWith({ lat: 9, lon: 2 })
  })

  it('honors replacement checkbox widgets rather than a type-name special case', async () => {
    const saved = vi.fn(async (_value: unknown) => {})
    const widgets = createDefaultWidgetRegistry().register('checkbox', (props) => <button onClick={() => props.onCommit(false)}>Custom checkbox</button>)
    rendered = await renderComponent(<JsonViewsProvider widgets={widgets}><JsonViewSchemaValueCell descriptor={{ type: 'checkbox' }} label="Done" value={true} onOpen={() => {}} onCommit={saved} /></JsonViewsProvider>)
    expect(rendered.container.querySelector('[data-id="jsonView-checkbox-toggle"]')).toBeNull()
    await click(rendered.container.querySelector('[data-id="atomic-edit-value"]'))
    await click(rendered.container.querySelector('[data-id="jsonView-schema-editor"] button'))
    expect(saved).toHaveBeenCalledWith(false)
  })

  it('reports quick-edit persistence failures and allows retry', async () => {
    const saved = vi.fn().mockRejectedValueOnce(new Error('Disk full')).mockResolvedValue(undefined)
    rendered = await renderComponent(<JsonViewSchemaValueCell descriptor={{ type: 'checkbox' }} label="Done" value={true} onOpen={() => {}} onCommit={saved} />)
    await click(rendered.container.querySelector('[data-id="jsonView-checkbox-toggle"]'))
    expect(rendered.container.querySelector('[role="alert"]')?.textContent).toContain('Disk full')
    await click(rendered.container.querySelector('[data-id="jsonView-checkbox-toggle"]'))
    expect(saved).toHaveBeenCalledTimes(2)
    expect(rendered.container.querySelector('[role="alert"]')).toBeNull()
  })

  it('exposes the state of read-only checkboxes to assistive technology', async () => {
    rendered = await renderComponent(<JsonViewSchemaValueDisplay descriptor={{ type: 'checkbox' }} value={true} onOpen={() => {}} />)
    const checkbox = rendered.container.querySelector('[role="checkbox"]')
    expect(checkbox?.getAttribute('aria-checked')).toBe('true')
    expect(checkbox?.getAttribute('aria-readonly')).toBe('true')
  })

  it('re-renders after a live widget registration changes', async () => {
    const widgets = createDefaultWidgetRegistry()
    rendered = await renderComponent(<JsonViewsProvider widgets={widgets}><JsonViewSchemaValueDisplay descriptor={{ type: 'text' }} value="value" onOpen={() => {}} /></JsonViewsProvider>)
    await act(async () => { widgets.register('text', { editor: () => null, display: () => <span>Plugin display</span> }) })
    expect(rendered.container.textContent).toContain('Plugin display')
  })

  it('uses external annotations without embedding them in JSON', async () => {
    const saved = vi.fn(async (_source: string) => {})
    const metadata = { version: 1, schema: { '$.name': { type: 'text', title: 'External name' } } }
    rendered = await renderComponent(<JSONContent content='{"name":"Ada"}' metadata={metadata} edit={edit(saved)} />)
    await click(rendered.container.querySelector('[aria-label="Edit External name"]'))
    const input = rendered.container.querySelector<HTMLInputElement>('input[aria-label="Edit External name"]')!
    await fill(input, 'Grace')
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    expect(JSON.parse(saved.mock.calls[0][0])).toEqual({ name: 'Grace' })
    expect(rendered.container.querySelector('[aria-label="Add view"]')).toBeNull()
  })

  it('keeps source available after a widget render exception', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const widgets = createDefaultWidgetRegistry().register('text', { editor: () => null, display: () => { throw new Error('Broken extension') } })
    rendered = await renderComponent(<JsonViewsProvider widgets={widgets}><JSONContent content='{"name":"Ada"}' /></JsonViewsProvider>)
    expect(rendered.container.querySelector<HTMLTextAreaElement>('textarea[aria-label="JSON source"]')?.value).toBe('{"name":"Ada"}')
    expect(rendered.container.querySelector('[role="alert"]')?.textContent).toContain('Broken extension')
  })

  it('does not expose lossy structured edits for unsafe numeric literals', async () => {
    rendered = await renderComponent(<JSONContent content='{"id":9007199254740993}' edit={edit()} />)
    expect(rendered.container.querySelector('[data-id="atomic-edit-value"]')).toBeNull()
    expect(rendered.container.querySelector<HTMLTextAreaElement>('textarea[aria-label="JSON source"]')?.value).toContain('9007199254740993')
  })

  it('leaves malformed and future metadata inspectable without offering metadata rewrites', async () => {
    for (const version of [1, 2]) {
      const content = JSON.stringify({ name: 'Ada', $jsonviews: { version, schema: { '$.name': { type: 'select', options: 'broken' } } } })
      rendered = await renderComponent(<JSONContent content={content} edit={edit()} />)
      expect(rendered.container.textContent).toContain('Ada')
      expect(rendered.container.querySelector('[data-id="jsonView-json-diagnostics"]')).not.toBeNull()
      if (version === 2) expect(rendered.container.querySelector('[aria-label="Add view"]')).toBeNull()
      await rendered.cleanup(); rendered = undefined
    }
  })
  it('does not overwrite an external update with an already-open field draft', async () => {
    const saved = vi.fn(async (_source: string) => {})
    rendered = await renderComponent(<JSONContent documentId="same-file" content='{"name":"Ada"}' edit={edit(saved)} />)
    await click(rendered.container.querySelector('[aria-label="Edit Name"]'))
    await fill(rendered.container.querySelector<HTMLInputElement>('input[aria-label="Edit Name"]')!, 'Draft')
    await act(async () => rendered!.root.render(<TooltipProvider><JSONContent documentId="same-file" content='{"name":"Grace"}' edit={edit(saved)} /></TooltipProvider>))
    const input = rendered.container.querySelector<HTMLInputElement>('input[aria-label="Edit Name"]')!
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    expect(saved).not.toHaveBeenCalled()
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('changed outside this editor')
    expect(input.value).toBe('Draft')
  })

  it.each(['[{"name":"Ada"}]', '{"rows":[{"name":"Ada"}]}'])('persists external annotation changes successfully for %s', async (source) => {
    const saved = vi.fn(async (_source: string) => {})
    const annotations = vi.fn(async (_metadata: Record<string, unknown>) => {})
    const metadata = { version: 1, futureSetting: { keep: true }, views: [{ id: 'all', name: 'All', path: source.startsWith('[') ? '$' : '$.rows' }] }
    rendered = await renderComponent(<JSONContent content={source} metadata={metadata} onMetadataChange={annotations} edit={edit(saved)} />)
    await click(rendered.container.querySelector('[data-id="jsonView-edit-view"]'))
    expect(rendered.container.querySelector('[data-id="jsonView-root-array-wrap-banner"]')).toBeNull()
    await fill(document.querySelector<HTMLInputElement>('input[aria-label="View name"]')!, 'People')
    await act(async () => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))
      await Promise.resolve()
    })
    expect(annotations).toHaveBeenCalledWith(expect.objectContaining({ version: 1, futureSetting: { keep: true } }))
    expect(saved).not.toHaveBeenCalled()
    expect(document.querySelector('[data-id="view-settings"]')).toBeNull()
    expect(document.querySelector('[role="alert"]')).toBeNull()
  })

  it('restores inference when controlled external metadata is removed', async () => {
    const content = '{"name":"Ada"}'
    rendered = await renderComponent(<JSONContent content={content} onSave={async () => {}} metadata={{ version: 1, schema: { '$.name': { type: 'text', title: 'External name' } } }} />)
    expect(rendered.container.querySelector('[aria-label="Edit External name"]')).not.toBeNull()
    await act(async () => rendered!.root.render(<TooltipProvider><JSONContent content={content} onSave={async () => {}} /></TooltipProvider>))
    expect(rendered.container.querySelector('[aria-label="Edit External name"]')).toBeNull()
    expect(rendered.container.querySelector('[aria-label="Edit Name"]')).not.toBeNull()
  })

  it('supports the minimal onSave embedding API', async () => {
    const saved = vi.fn(async (_source: string) => {})
    rendered = await renderComponent(<JSONContent documentId="embedded" content='{"done":false}' onSave={saved} />)
    await click(rendered.container.querySelector('[data-id="jsonView-checkbox-toggle"]'))
    expect(saved).toHaveBeenCalledWith('{"done":true}', expect.objectContaining({ documentId: 'embedded', baseContent: '{"done":false}' }))
  })

  it('uses drag movement without redundant native controls on Kanban cards', async () => {
    const saved = vi.fn(async (_source: string) => {})
    const value = { rows: [{ name: 'Ada', status: 'new' }], $jsonviews: { version: 1, schema: { '$.rows[*].status': { type: 'select', options: ['new', 'done'] } }, views: [{ name: 'Board', path: '$.rows', display: 'kanban', groupBy: '$.rows[*].status' }] } }
    rendered = await renderComponent(<JSONContent content={JSON.stringify(value)} edit={edit(saved)} />)
    const card = rendered.container.querySelector<HTMLElement>('[data-id="jsonView-kanban-card"]')
    expect(card?.draggable).toBe(true)
    expect(card?.querySelector('select[aria-label^="Move "]')).toBeNull()
    expect(card?.querySelector('button[aria-label^="Move "]')).toBeNull()
  })

  it('uses custom filter operators through projection and view settings', async () => {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600)
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(800)
    const types = createDefaultTypeRegistry().register({ name: 'parity', validate: () => undefined, filterOperators: ['even'], matchesFilter: (value, operator) => operator === 'even' ? Number(value) % 2 === 0 : undefined })
    const metadata = { version: 1, schema: { '$.rows[*].score': { type: 'parity' } }, views: [{ name: 'Even rows', path: '$.rows', filter: { match: 'all', rules: [{ path: '$.rows[*].score', operator: 'even', value: true }] } }] }
    rendered = await renderComponent(<JsonViewsProvider types={types}><JSONContent content='{"rows":[{"name":"Ada","score":1},{"name":"Grace","score":2}]}' metadata={metadata} onMetadataChange={async () => {}} edit={edit()} /></JsonViewsProvider>)
    const rowText = rendered.container.querySelector('tbody')?.textContent
    expect(rowText).toContain('Grace')
    expect(rowText).not.toContain('Ada')
    await click(rendered.container.querySelector('[data-id="jsonView-edit-view"]'))
    const condition = document.querySelector<HTMLButtonElement>('button[aria-label="Filter 1 condition"]')!
    expect(condition.textContent).toContain('even')
  })

  it('exposes virtual row positions and keyboard column resizing', async () => {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600)
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(800)
    rendered = await renderComponent(<JSONContent sourceVisible={false} content='[{"name":"Ada","score":1},{"name":"Grace","score":2}]' />)
    const table = rendered.container.querySelector('table')!
    expect(table.getAttribute('aria-rowcount')).toBe('3')
    expect(table.querySelector('tr[data-index="0"]')?.getAttribute('aria-rowindex')).toBe('2')
    const separator = rendered.container.querySelector<HTMLElement>('[role="separator"]')!
    expect(separator.tabIndex).toBe(0)
    const before = Number(separator.getAttribute('aria-valuenow'))
    await act(async () => separator.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })))
    expect(Number(separator.getAttribute('aria-valuenow'))).toBe(before + 10)
  })

  it('edits safe siblings while preserving unsafe number and duplicate-key source tokens', async () => {
    for (const risk of ['"id":9007199254740993', '"id":1,"id":2']) {
      const saved = vi.fn(async (_source: string) => {})
      rendered = await renderComponent(<JSONContent content={`{"name":"Ada",${risk}}`} edit={edit(saved)} />)
      expect(rendered.container.querySelector('[aria-label="Edit Id"]')).toBeNull()
      await click(rendered.container.querySelector('[aria-label="Edit Name"]'))
      const input = rendered.container.querySelector<HTMLInputElement>('input[aria-label="Edit Name"]')!
      await fill(input, 'Grace')
      await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
      expect(saved.mock.calls[0][0]).toBe(`{"name":"Grace",${risk}}`)
      await rendered.cleanup(); rendered = undefined
    }
  })

  it('retries a failed row insertion without appending a second row', async () => {
    const saved = vi.fn().mockRejectedValueOnce(new Error('Disk full')).mockResolvedValue(undefined)
    const content = JSON.stringify({ rows: [], $jsonviews: { version: 1, schema: { '$.rows[*].name': { type: 'text' } }, views: [{ name: 'Rows', path: '$.rows', columns: [{ label: 'Name', path: '$.rows[*].name' }] }] } })
    rendered = await renderComponent(<JSONContent content={content} edit={edit(saved)} />)
    await click(rendered.container.querySelector('[data-id="tabular-add-row"]'))
    expect(rendered.container.querySelector('[role="alert"]')?.textContent).toContain('Disk full')
    const retry = Array.from(rendered.container.querySelectorAll('button')).find((button) => button.textContent === 'Retry save')!
    await click(retry)
    expect(saved).toHaveBeenCalledTimes(2)
    expect(JSON.parse(saved.mock.calls[0][0]).rows).toEqual([{ name: '' }])
    expect(saved.mock.calls[1][0]).toBe(saved.mock.calls[0][0])
  })

  it.each([{ lat: 1, lon: 2 }, [1, 2]])('uses registered container widgets at the root and can expand their structure', async (value) => {
    const types = createDefaultTypeRegistry().register({ name: 'container', validate: () => undefined })
    const replacement = Array.isArray(value) ? [3, 4] : { lat: 3, lon: 4 }
    const widgets = createDefaultWidgetRegistry().register('container', {
      display: () => <span>Container display</span>,
      editor: (props) => <button onClick={() => props.onCommit(replacement)}>Update container</button>,
    })
    const saved = vi.fn(async (_source: string) => {})
    rendered = await renderComponent(<JsonViewsProvider types={types} widgets={widgets}><JSONContent content={JSON.stringify(value)} metadata={{ version: 1, schema: { '$': { type: 'container' } } }} edit={edit(saved)} /></JsonViewsProvider>)
    expect(rendered.container.textContent).toContain('Container display')
    await click(rendered.container.querySelector('button[title="Expand value"]'))
    expect(rendered.container.textContent).not.toContain('Container display')
    await click(Array.from(rendered.container.querySelectorAll('button')).find((button) => button.textContent === 'Back to annotated value')!)
    await click(rendered.container.querySelector('[data-id="atomic-edit-value"]'))
    await click(rendered.container.querySelector('[data-id="jsonView-schema-editor"] button'))
    expect(JSON.parse(saved.mock.calls[0][0])).toEqual(replacement)
  })

  it('exposes one accessible checkbox state for an interactive quick edit', async () => {
    rendered = await renderComponent(<JsonViewSchemaValueCell descriptor={{ type: 'checkbox' }} label="Done" value={true} onOpen={() => {}} onCommit={async () => {}} />)
    expect(rendered.container.querySelectorAll('[role="checkbox"]')).toHaveLength(1)
    expect(rendered.container.querySelector('[role="checkbox"]')?.getAttribute('aria-checked')).toBe('true')
  })

  it.each(['9007199254740993', '1e400', '1e-4000', '-0', '1.0000000000000001'])('displays the exact numeric literal %s in scalar roots and general cells', async (literal) => {
    for (const content of [literal, `{"id":${literal}}`]) {
      rendered = await renderComponent(<JSONContent content={content} edit={edit()} />)
      expect(rendered.container.querySelector('[data-id="jsonView-exact-source-number"]')?.textContent).toBe(literal)
      expect(rendered.container.querySelector('[data-id="atomic-edit-value"]')).toBeNull()
      await rendered.cleanup(); rendered = undefined
    }
  })

  it('preserves the exact unsafe numeric identity in projected tables and record titles', async () => {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600)
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(800)
    const metadata = { version: 1, views: [{ name: 'Records', path: '$.rows', columns: [{ label: 'ID', path: '$.rows[*].id' }, { label: 'Name', path: '$.rows[*].name' }] }] }
    rendered = await renderComponent(<JSONContent content='{"rows":[{"id":9007199254740993,"name":"Ada"}]}' metadata={metadata} edit={edit()} />)
    expect(rendered.container.querySelector('tbody [data-id="jsonView-exact-source-number"]')?.textContent).toBe('9007199254740993')
    await click(rendered.container.querySelector('[data-id="atomic-edit-value"][aria-label^="Open "]'))
    expect(rendered.container.querySelector('[data-id="jsonView-record-title"]')?.textContent).toBe('9007199254740993')
  })

  it('preserves the exact unsafe numeric identity in Kanban card titles and fields', async () => {
    const metadata = { version: 1, views: [{ name: 'Board', path: '$.rows', display: 'kanban', columns: [{ label: 'ID', path: '$.rows[*].id' }, { label: 'Other', path: '$.rows[*].other' }], groupBy: '$.rows[*].status' }] }
    rendered = await renderComponent(<JSONContent content='{"rows":[{"id":9007199254740993,"other":1e400,"status":"new"}]}' metadata={metadata} edit={edit()} />)
    const card = rendered.container.querySelector('[data-id="jsonView-kanban-card"]')!
    expect(card.textContent).toContain('9007199254740993')
    expect(card.textContent).not.toContain('9007199254740992')
    expect(card.querySelector('[data-id="jsonView-exact-source-number"]')?.textContent).toBe('1e400')
  })

  it('bypasses custom ancestor formatters when a container contains a lossy numeric value', async () => {
    const display = vi.fn(() => <span>Incorrect formatter</span>)
    const types = createDefaultTypeRegistry().register({ name: 'container', validate: () => undefined })
    const widgets = createDefaultWidgetRegistry().register('container', { display, editor: () => <button>Edit container</button> })
    rendered = await renderComponent(<JsonViewsProvider types={types} widgets={widgets}><JSONContent content='{"id":9007199254740993}' metadata={{ version: 1, schema: { '$': { type: 'container' } } }} edit={edit()} /></JsonViewsProvider>)
    expect(display).not.toHaveBeenCalled()
    expect(rendered.container.querySelector('[data-id="atomic-edit-value"]')).toBeNull()
    await click(rendered.container.querySelector('button[title="Expand value"]'))
    expect(rendered.container.querySelector('[data-id="jsonView-exact-source-number"]')?.textContent).toBe('9007199254740993')
  })

  it.each([
    ['{"a":9007199254740993,"a":1}', '$', '1'],
    ['{"a":1,"a":9007199254740993}', '$', '9007199254740993'],
    ['{"a":{"n":9007199254740993},"a":{"n":1}}', '$.a', '1'],
    ['{"a":{"n":1},"a":{"n":9007199254740993}}', '$.a', '9007199254740993'],
  ])('displays only the effective duplicate property occurrence in %s', async (content, path, expected) => {
    const metadata = { version: 1, views: [{ name: 'Record', path }] }
    rendered = await renderComponent(<JSONContent content={content} metadata={metadata} edit={edit()} />)
    const value = rendered.container.querySelector('[data-id="jsonView-record-view"] dd')!
    expect(value.textContent).toBe(expected)
    expect(value.querySelector('[data-id="atomic-edit-value"]')).toBeNull()
    expect(value.querySelector('[data-id="jsonView-exact-source-number"]')?.textContent).toBe(expected === '1' ? undefined : expected)
  })

})
