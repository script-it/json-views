import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import postcss from 'postcss'

test('published CSS stays within the viewer and does not control host layers or variables', async () => {
  const css = postcss.parse(await readFile(new URL('../packages/react/dist/styles.css', import.meta.url), 'utf8'))
  let selectors = 0
  css.walkAtRules('layer', () => assert.fail('Package styles must not participate in global host cascade layers'))
  css.walkAtRules('property', (rule) => assert.match(rule.params, /^--jv-/))
  css.walkAtRules(/keyframes$/, (rule) => assert.match(rule.params, /^jv-/))
  css.walkDecls((decl) => {
    if (decl.prop.startsWith('--')) assert.match(decl.prop, /^--(?:jv-|json-views-)/)
  })
  css.walkRules((rule) => {
    for (let parent = rule.parent; parent; parent = parent.parent) {
      if (parent.type === 'rule' || (parent.type === 'atrule' && parent.name.endsWith('keyframes'))) return
    }
    for (const selector of rule.selectors) {
      assert.match(selector, /^\.json-views-(?:root|portals)(?:\b|[\s:[.#])/)
      selectors += 1
    }
  })
  assert(selectors > 50, 'Check the actual compiled utility stylesheet, not an empty placeholder')
  const standalone = postcss.parse(await readFile(new URL('../packages/react/dist/standalone.css', import.meta.url), 'utf8'))
  standalone.walkAtRules(/keyframes$/, (rule) => assert.match(rule.params, /^json-views-/))
  standalone.walkRules((rule) => {
    for (let parent = rule.parent; parent; parent = parent.parent) {
      if (parent.type === 'atrule' && parent.name.endsWith('keyframes')) return
    }
    rule.selectors.forEach((selector) => assert.match(selector, /^\.json-views-app\b/))
  })
})
