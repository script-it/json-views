import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderMarkdownBody } from './markdown.js'

let container: HTMLDivElement
let root: Root
const parentMouseDown = vi.fn()

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  parentMouseDown.mockReset()
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function render(markdown: string) {
  // The parent stands in for the editable value, which opens its editor on mouse down.
  act(() => root.render(<div onMouseDown={parentMouseDown}>{renderMarkdownBody(markdown)}</div>))
}

function link(text: string): HTMLAnchorElement {
  const found = [...container.querySelectorAll('a')].find((anchor) => anchor.textContent?.includes(text))
  if (!found) throw new Error(`No link containing “${text}”`)
  return found
}

function stubClipboard() {
  const writeText = vi.fn(async (_text: string) => {})
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  return writeText
}

describe('Markdown links', () => {
  it('renders links titled "button" as buttons without a tooltip', () => {
    render('[Start](#/files/a.json "button primary") [More](#/files/b.json "button") [Plain](#/files/c.json "Help")')
    expect(link('Start').className).toBe('button primary markdown-button')
    expect(link('Start').hasAttribute('title')).toBe(false)
    expect(link('More').className).toBe('button secondary markdown-button')
    expect(link('Plain').className).toBe('')
    expect(link('Plain').title).toBe('Help')
  })

  it('keeps site and agent links in the same tab and opens other links in a new one', () => {
    render([
      '[View](#/files/Tasks.json/views/Board)',
      '[Claude](claude://code/new?q=Install)',
      '[Codex](codex://new?prompt=Install)',
      '[Cursor](cursor://anysphere.cursor-deeplink/prompt?text=Install)',
      '[Grok](grokbot://app/v1/prompt?text=Install)',
      '[GitHub](https://github.com/script-it/json-views)',
    ].join(' '))
    for (const text of ['View', 'Claude', 'Codex', 'Cursor', 'Grok']) {
      expect(link(text).hasAttribute('target')).toBe(false)
    }
    expect(link('Claude').getAttribute('href')).toBe('claude://code/new?q=Install')
    expect(link('Grok').getAttribute('href')).toBe('grokbot://app/v1/prompt?text=Install')
    expect(link('GitHub').target).toBe('_blank')
    expect(link('GitHub').rel).toBe('noreferrer')
  })

  it('removes links to other non-web protocols', () => {
    render('[Script](javascript:alert(1)) [App](otherapp://open) [Raw](<a href="vbscript:run">Raw</a>)')
    for (const text of ['Script', 'App']) expect(link(text).getAttribute('href')).toBeFalsy()
    expect(container.innerHTML).not.toMatch(/javascript:|otherapp:|vbscript:/)
  })

  it('scrolls an in-page link to the heading whose text matches it', () => {
    render('[Run it locally](#run-it-locally "button")\n\n## Introduction\n\n### Run it locally\n\nText')
    const heading = [...container.querySelectorAll('h3')].find((candidate) => candidate.textContent === 'Run it locally')!
    const scrollIntoView = vi.fn()
    heading.scrollIntoView = scrollIntoView
    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    act(() => { link('Run it locally').dispatchEvent(click) })
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
    expect(click.defaultPrevented).toBe(true)
  })

  it('copies the text carried by a copy link without opening the editor', async () => {
    const writeText = stubClipboard()
    const prompt = 'Set up JSON Views:\n1. Install `the skill`.'
    render(`[Copy prompt](#copy:${encodeURIComponent(prompt)} "button")`)
    const copy = link('Copy prompt')
    expect(copy.getAttribute('href')).toBe('#')
    act(() => { copy.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
    await act(async () => { copy.click() })
    expect(writeText).toHaveBeenCalledWith(prompt)
    expect(copy.textContent).toBe('Copied')
    expect(parentMouseDown).not.toHaveBeenCalled()
  })

  it('ignores a copy link whose text cannot be decoded', async () => {
    const writeText = stubClipboard()
    render('[Copy](#copy:%E0%A4%A "button")')
    await act(async () => { link('Copy').click() })
    expect(writeText).not.toHaveBeenCalled()
    expect(link('Copy').textContent).toBe('Copy')
  })
})

describe('Markdown code blocks', () => {
  it('adds a Copy button that copies the block text without opening the editor', async () => {
    const writeText = stubClipboard()
    render('```bash\nnpx @script-it/json-views ./data.json\n```')
    const button = container.querySelector<HTMLButtonElement>('.markdown-copy')!
    act(() => { button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
    await act(async () => { button.click() })
    expect(writeText).toHaveBeenCalledWith('npx @script-it/json-views ./data.json\n')
    expect(button.textContent).toBe('Copied')
    expect(parentMouseDown).not.toHaveBeenCalled()
  })
})
