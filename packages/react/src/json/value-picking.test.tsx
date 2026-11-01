// @vitest-environment jsdom

import { act, type ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderComponent, type RenderResult } from '../test/render.js'
import { createJsonViewsController } from '../controller.js'
import type { JsonViewsPick } from '../structured-data/picking.js'
import { TooltipProvider } from '../primitives/tooltip.js'
import { JSONContent, type JSONContentProps } from './json-content.js'

let rendered: RenderResult | null = null

afterEach(async () => {
  await rendered?.cleanup()
  rendered = null
  vi.restoreAllMocks()
})

const PEOPLE = [
  { name: 'Ada', note: 'Analytical engine', email: 'ada@example.com', site: 'https://example.com/ada' },
  { name: 'Grace', note: 'Compilers', email: 'grace@example.com', site: 'https://example.com/grace' },
]

// jsdom lays nothing out: the virtual table needs a viewport to render rows, and scrolling has to move it.
function giveVirtualTableAViewport(): void {
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600)
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(800)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 800, 40))
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600)
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(100_000)
  Element.prototype.scrollTo = function scrollTo(this: Element, options?: ScrollToOptions | number) {
    if (typeof options === 'object' && options.top !== undefined) this.scrollTop = options.top
    this.dispatchEvent(new Event('scroll'))
  } as Element['scrollTo']
}

async function render(element: ReactElement): Promise<RenderResult> {
  giveVirtualTableAViewport()
  rendered = await renderComponent(element)
  return rendered
}

// An open cell editor, plain or schema-typed.
const editor = () => rendered!.container.querySelector('[data-id="atomic-direct-editor"], [data-id="jsonView-schema-editor"]')
const valueElement = (path: unknown[]) => rendered!.container.querySelector<HTMLElement>(`[data-json-views-path='${JSON.stringify(path)}']`)

async function press(element: Element | null, init?: MouseEventInit): Promise<boolean> {
  if (!(element instanceof HTMLElement)) throw new Error('Expected an element to press')
  let notCancelled = true
  await act(async () => {
    notCancelled = element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init }))
    await Promise.resolve()
  })
  return notCancelled
}

function select(node: Node, start: number, endNode: Node, end: number): void {
  const range = document.createRange()
  range.setStart(node, start)
  range.setEnd(endNode, end)
  const selection = document.getSelection()!
  selection.removeAllRanges()
  selection.addRange(range)
}

const textIn = (element: Element | null, text: string): Text => {
  const walker = document.createTreeWalker(element!, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) if (node.textContent?.includes(text)) return node as Text
  throw new Error(`No text ${text}`)
}

describe('values in the DOM', () => {
  it('names each row and cell of a table by its source path', async () => {
    await render(<JSONContent content={JSON.stringify(PEOPLE)} path="people.json" />)
    expect(valueElement([1])?.tagName).toBe('TR')
    expect(valueElement([1, 'email'])?.tagName).toBe('TD')
    expect(valueElement([1, 'email'])?.textContent).toContain('grace@example.com')
  })

  it('names a record and each of its fields, each field a box of its own', async () => {
    await render(<JSONContent content={JSON.stringify({ name: 'Ada', email: 'ada@example.com', age: 36 })} path="ada.json" />)
    expect(valueElement([])?.tagName).toBe('ARTICLE')
    const field = valueElement(['age'])
    expect(field?.className).toContain('grid-cols-subgrid')
    expect(field?.querySelector('dt')?.nextElementSibling?.tagName).toBe('DD')
  })
})

describe('picking values', () => {
  it('reports a pressed cell instead of opening its editor', async () => {
    const picks: JsonViewsPick[] = []
    await render(<JSONContent content={JSON.stringify(PEOPLE)} path="people.json" onSave={async () => undefined} onPick={(pick) => picks.push(pick)} />)
    await press(valueElement([1, 'note'])!.querySelector('[data-id="atomic-edit-value"]'))
    expect(picks.map(({ path }) => path)).toEqual([[1, 'note']])
    expect(picks[0].element).toBe(valueElement([1, 'note']))
    expect(editor()).toBeNull()
  })

  it('edits as before without onPick', async () => {
    await render(<JSONContent content={JSON.stringify(PEOPLE)} path="people.json" onSave={async () => undefined} />)
    await press(valueElement([1, 'note'])!.querySelector('[data-id="atomic-edit-value"]'))
    expect(editor()).not.toBeNull()
    expect(rendered!.container.querySelector('[data-json-views-picking]')).toBeNull()
  })

  it('picks the title cell from its OPEN button, and the row from its leading icon', async () => {
    const picks: JsonViewsPick[] = []
    await render(<JSONContent content={JSON.stringify(PEOPLE)} path="people.json" onPick={(pick) => picks.push(pick)} />)
    await press(valueElement([1])!.querySelector('[data-id="tabular-open-record"]'))
    await press(valueElement([1])!.querySelector('[data-json-views-pick-row]'))
    expect(picks.map(({ path }) => path)).toEqual([[1, 'name'], [1]])
    expect(rendered!.container.querySelector('[data-id="jsonView-record-view"]')).toBeNull()
  })

  it('keeps a link from opening, and picks a focused value with Enter', async () => {
    const picks: JsonViewsPick[] = []
    await render(<JSONContent content={JSON.stringify(PEOPLE)} path="people.json" onSave={async () => undefined} onPick={(pick) => picks.push(pick)} />)
    expect(await press(valueElement([0, 'site'])!.querySelector('a'))).toBe(false)
    await act(async () => {
      valueElement([0, 'note'])!.querySelector('[data-id="atomic-edit-value"]')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      await Promise.resolve()
    })
    expect(picks.map(({ path }) => path)).toEqual([[0, 'site'], [0, 'note']])
    expect(editor()).toBeNull()
  })

  it('reports text selected inside a value, and the row for a selection across its cells', async () => {
    const picks: JsonViewsPick[] = []
    await render(<JSONContent content={JSON.stringify(PEOPLE)} path="people.json" onPick={(pick) => picks.push(pick)} />)
    const note = textIn(valueElement([1, 'note']), 'Compilers')
    select(note, 0, note, 4)
    await press(note.parentElement)
    select(textIn(valueElement([1, 'name']), 'Grace'), 0, note, 4)
    await press(note.parentElement)
    expect(picks.map(({ path, selection }) => [path, selection?.text])).toEqual([[[1, 'note'], 'Comp'], [[1], expect.stringContaining('Grace')]])
  })

  it('keeps the tabs working, and Kanban cards still', async () => {
    const tasks = [{ name: 'Ada', status: 'Active' }, { name: 'Grace', status: 'Later' }]
    const source = JSON.stringify({ $jsonviews: { version: 1, views: [{ id: 'board', name: 'Board', path: '$.tasks', display: 'kanban', groupBy: '$.tasks[*].status' }] }, tasks })
    await render(<JSONContent content={source} path="tasks.json" onSave={async () => undefined} onPick={() => undefined} />)
    const card = valueElement(['tasks', 1])
    expect(card?.getAttribute('data-id')).toBe('jsonView-kanban-card')
    expect(card?.getAttribute('draggable')).toBe('false')
    const tab = rendered!.container.querySelector<HTMLElement>('[data-id="jsonView-json-tab-source"]')!
    await act(async () => {
      tab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))
      tab.click()
      await Promise.resolve()
    })
    expect(rendered!.container.querySelector('[data-id="jsonView-source-editor"]')).not.toBeNull()
  })
})

describe('marks', () => {
  it('labels marked values with their sorted kinds, picking or not, and follows the marks', async () => {
    const content = JSON.stringify(PEOPLE)
    await render(<JSONContent content={content} path="people.json" marks={[{ path: [1, 'email'], kind: 'queued' }, { path: [1, 'email'], kind: 'draft' }, { path: [0], kind: 'queued' }]} />)
    expect(valueElement([1, 'email'])?.getAttribute('data-json-views-mark')).toBe('draft queued')
    expect(valueElement([0])?.getAttribute('data-json-views-mark')).toBe('queued')
    await act(async () => {
      rendered!.root.render(<JSONContent content={content} path="people.json" marks={[{ path: [0, 'name'], kind: 'focus' }]} />)
      await Promise.resolve()
    })
    expect(valueElement([1, 'email'])?.hasAttribute('data-json-views-mark')).toBe(false)
    expect(valueElement([0, 'name'])?.getAttribute('data-json-views-mark')).toBe('focus')
  })
})

describe('the controller', () => {
  const many = Array.from({ length: 1000 }, (_value, index) => ({ name: `Person ${index}`, email: `p${index}@example.com` }))

  it('finds a shown value, and scrolls a far row of a long table in', async () => {
    const controller = createJsonViewsController()
    await render(<JSONContent content={JSON.stringify(many)} path="many.json" controller={controller} marks={[{ path: [900, 'email'], kind: 'queued' }]} />)
    expect(controller.elementForPath([0, 'email'])).toBe(valueElement([0, 'email']))
    expect(valueElement([900])).toBeNull()
    let revealed: HTMLElement | null = null
    await act(async () => { revealed = await controller.revealPath([900, 'email']) })
    expect(revealed).toBe(valueElement([900, 'email']))
    expect(revealed!.getAttribute('data-json-views-mark')).toBe('queued')
  })

  it('resolves a value its view does not show to the nearest shown ancestor, and nothing to null', async () => {
    const controller = createJsonViewsController()
    const people = [...PEOPLE.slice(0, 1), { ...PEOPLE[1], notes: { met: 1843 } }]
    await render(<JSONContent content={JSON.stringify(people)} path="people.json" controller={controller} presentationState={{ version: 1, queries: { root: 'Grace' } }} />)
    let found: HTMLElement | null = null
    await act(async () => { found = await controller.revealPath([1, 'notes', 'met']) })
    expect(found).toBe(valueElement([1, 'notes']) ?? valueElement([1]))
    // Ada's row is searched away; a missing path is shown nowhere.
    await act(async () => { found = await controller.revealPath([0, 'email'], { timeoutMs: 200 }) })
    expect(found).toBeNull()
    await act(async () => { found = await controller.revealPath([7, 'email'], { timeoutMs: 200 }) })
    expect(found).toBeNull()
  })

  it('resolves null when no viewer is bound', async () => {
    expect(await createJsonViewsController().revealPath([0], { timeoutMs: 50 })).toBeNull()
  })
})

describe('an HTML view', () => {
  const source = JSON.stringify({
    planes: [{ id: 'a', name: 'Classic Dart', design: 'Dart', built: false }, { id: 'b', name: 'Glider', design: 'Glider', built: true }],
    $jsonviews: { version: 1, views: [{ name: 'Hangar', path: '$', display: 'html', html: '<jv-repeat source="$.planes" as="plane" key="id"><article><p>Plane</p><h2><jv-field bind="plane.name"></jv-field></h2><p><jv-value bind="plane.design"></jv-value></p><label><input type="checkbox" jv-bind="plane.built"> Built</label></article></jv-repeat>' }] },
  }, null, 2)

  // jsdom does not load srcdoc: the view mounts into the trusted skeleton's mount once its frame reports the load.
  async function renderFrame(props: Partial<JSONContentProps> = {}): Promise<Document> {
    await render(<JSONContent content={source} path="planes.json" {...props} />)
    const frame = rendered!.container.querySelector('iframe')!
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)) })
    const doc = frame.contentDocument!
    await act(async () => { doc.body.innerHTML = '<div id="mount"></div>'; frame.dispatchEvent(new Event('load')) })
    await act(async () => { rendered!.root.render(<TooltipProvider><JSONContent content={source} path="planes.json" revision="one" {...props} /></TooltipProvider>) })
    return doc
  }

  const inFrame = (doc: Document, path: unknown[]) => doc.querySelector<HTMLElement>(`[data-json-views-path='${JSON.stringify(path)}']`)

  // Events the frame's own window makes, as its elements' are.
  async function pressInFrame(element: Element | null, type: 'click' | 'mousedown' = 'click'): Promise<boolean> {
    if (!element) throw new Error('Expected an element in the frame')
    let notCancelled = true
    await act(async () => {
      notCancelled = element.dispatchEvent(new element.ownerDocument.defaultView!.MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }))
      await Promise.resolve()
    })
    return notCancelled
  }

  it('names each bound value, bound control and repeated item by its source path, and marks them', async () => {
    const doc = await renderFrame({ onSave: async () => undefined, marks: [{ path: ['planes', 1, 'name'], kind: 'draft' }] })
    expect(inFrame(doc, ['planes', 1])?.tagName).toBe('ARTICLE')
    expect(inFrame(doc, ['planes', 1, 'name'])?.textContent).toBe('Glider')
    expect(inFrame(doc, ['planes', 1, 'name'])?.getAttribute('data-json-views-mark')).toBe('draft')
    expect(inFrame(doc, ['planes', 0, 'design'])?.textContent).toBe('Dart')
    expect(inFrame(doc, ['planes', 0, 'built'])?.tagName).toBe('INPUT')
  })

  it('picks a bound field instead of opening its editor, a bound checkbox without changing it, and an item from its own text', async () => {
    const picks: JsonViewsPick[] = []
    const save = vi.fn(async () => undefined)
    const doc = await renderFrame({ onSave: save, onPick: (pick) => picks.push(pick) })
    expect(await pressInFrame(doc.querySelector('button.jv-field'))).toBe(false)
    expect(document.querySelector('[data-anchored-popup]')).toBeNull()
    const checkbox = inFrame(doc, ['planes', 0, 'built']) as HTMLInputElement
    expect(await pressInFrame(checkbox, 'mousedown')).toBe(false)
    expect(await pressInFrame(checkbox)).toBe(false)
    expect(checkbox.checked).toBe(false)
    await pressInFrame(inFrame(doc, ['planes', 1])!.querySelector('p'))
    expect(picks.map((pick) => pick.path)).toEqual([['planes', 0, 'name'], ['planes', 0, 'built'], ['planes', 1]])
    expect(picks[0].element).toBe(inFrame(doc, ['planes', 0, 'name']))
    expect(save).not.toHaveBeenCalled()
  })

  it('reports text selected inside a value of the frame', async () => {
    const picks: JsonViewsPick[] = []
    const doc = await renderFrame({ onSave: async () => undefined, onPick: (pick) => picks.push(pick) })
    const field = inFrame(doc, ['planes', 1, 'name'])!.querySelector('button')!
    const range = doc.createRange()
    range.setStart(field.firstChild!, 0)
    range.setEnd(field.firstChild!, 3)
    doc.getSelection()!.removeAllRanges()
    doc.getSelection()!.addRange(range)
    await pressInFrame(field)
    expect(picks).toHaveLength(1)
    expect(picks[0]).toMatchObject({ path: ['planes', 1, 'name'], selection: { text: 'Gli' } })
  })

  it('finds and reveals a value in the frame, and a value it does not show by its item', async () => {
    const controller = createJsonViewsController()
    const doc = await renderFrame({ controller })
    expect(controller.elementForPath(['planes', 1, 'design'])).toBe(inFrame(doc, ['planes', 1, 'design']))
    let found: HTMLElement | null = null
    await act(async () => { found = await controller.revealPath(['planes', 1, 'id']) })
    expect(found).toBe(inFrame(doc, ['planes', 1]))
  })

  it('adds the host CSS to the frame, with the host values of what it reads, and marks the frame while picking', async () => {
    const htmlViewCss = '[data-json-views-mark~="draft"] { background: var(--host-mark); }'
    // The frame takes the value the host's page gives its iframe element.
    document.body.style.setProperty('--host-mark', 'rgb(1, 2, 3)')
    const doc = await renderFrame({ htmlViewCss, onPick: () => undefined })
    document.body.style.removeProperty('--host-mark')
    expect(doc.head.textContent).toContain(htmlViewCss)
    expect(doc.documentElement.style.getPropertyValue('--host-mark')).toBe('rgb(1, 2, 3)')
    expect(doc.documentElement.hasAttribute('data-json-views-picking')).toBe(true)
    await act(async () => { rendered!.root.render(<TooltipProvider><JSONContent content={source} path="planes.json" revision="one" htmlViewCss={htmlViewCss} /></TooltipProvider>) })
    expect(doc.documentElement.hasAttribute('data-json-views-picking')).toBe(false)
  })
})
