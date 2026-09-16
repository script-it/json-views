// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { parseHtmlTemplate } from './template.js'
it('keeps safe layout/SVG and removes execution, URLs and unsafe attributes', () => {
  const parsed = parseHtmlTemplate(document, '<script>bad()</script><div onclick="bad()" style="position:fixed"><img src="https://example.invalid/image"><svg><circle cx="10" jv-attr-cy="$.y" fill="url(https://example.invalid)"></circle><foreignObject><iframe src="/bad"></iframe></foreignObject></svg></div>')
  const text = JSON.stringify(parsed.nodes)
  expect(text).not.toContain('bad()'); expect(text).not.toContain('https:'); expect(text).not.toContain('foreignobject'); expect(text).toContain('jv-attr-cy')
  expect(parsed.warnings.length).toBeGreaterThan(0)
})
it('rejects custom self-closing tags and bounds nested templates', () => {
  expect(() => parseHtmlTemplate(document, '<jv-field bind="$.name" />')).toThrow('closing tags')
  expect(() => parseHtmlTemplate(document, '<div>'.repeat(66) + 'x' + '</div>'.repeat(66))).toThrow('nesting')
})
