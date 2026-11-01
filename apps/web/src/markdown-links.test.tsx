import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { renderMarkdownBody } from './App.js'

const href = (markdown: string) => {
  const container = document.createElement('div')
  container.innerHTML = renderToStaticMarkup(renderMarkdownBody(markdown))
  return container.querySelector('a')?.getAttribute('href') ?? ''
}

describe('Markdown link protocols', () => {
  it.each(['claude', 'codex', 'cursor', 'grokbot'])('allows %s: agent links in the same tab', (protocol) => {
    const target = `${protocol}://new?prompt=hello`
    expect(href(`[Run](${target})`)).toBe(target)
    expect(href(`<a href="${target}">Run</a>`)).toBe(target)
    expect(renderToStaticMarkup(renderMarkdownBody(`[Run](${target})`))).not.toContain('target=')
  })

  it.each([
    'javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'javascript:claude:alert(1)', 'data:text/html,hi', 'vbscript:x',
    'file:///etc/passwd', 'vscode://x', 'claudex://x', 'cursorx:y', 'x-claude:y',
  ])('blocks %s', (target) => {
    expect(href(`[Run](${target})`)).toBe('')
    expect(href(`<a href="${target}">Run</a>`)).toBe('')
  })

  it('keeps web links in a new tab', () => {
    const html = renderToStaticMarkup(renderMarkdownBody('[Docs](https://example.com)'))
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('target="_blank"')
  })
})
