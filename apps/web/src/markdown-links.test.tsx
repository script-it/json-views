import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { renderMarkdownBody } from './App.js'

function links(markdown: string) {
  const container = document.createElement('div')
  container.innerHTML = renderToStaticMarkup(renderMarkdownBody(markdown))
  return Array.from(container.querySelectorAll('a'))
}

describe('Markdown link protocols', () => {
  it.each([
    'claude://code/new?q=Install', 'codex://new?prompt=Install',
    'cursor://anysphere.cursor-deeplink/prompt?text=Install',
  ])('keeps the supported prompt link in Markdown and HTML: %s', target => {
    const result = links(`[Run](${target}) <a href="${target}">Run</a>`)
    expect(result).toHaveLength(2)
    for (const link of result) {
      expect(link.getAttribute('href')).toBe(target)
      expect(link.hasAttribute('target')).toBe(false)
    }
  })

  it.each([
    'javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'javascript:claude:alert(1)',
    'data:text/html,hi', 'vbscript:x', 'file:///etc/passwd', 'vscode://x',
    'claudex://x', 'cursorx:y', 'x-claude:y', 'codex://settings', 'grokbot://new',
  ])('blocks unsupported links in Markdown and HTML: %s', target => {
    const result = links(`[Run](${target}) <a href="${target}">Run</a>`)
    expect(result).toHaveLength(2)
    for (const link of result) expect(link.getAttribute('href') || '').toBe('')
  })
})
