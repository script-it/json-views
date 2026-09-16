import { readFile, writeFile } from 'node:fs/promises'
import postcss from 'postcss'

const file = new URL('../packages/react/dist/styles.css', import.meta.url)
const css = postcss.parse(await readFile(file, 'utf8'))
// Host styles may be unlayered. Scoped package rules retain normal specificity,
// independent of the host's global cascade layer order.
css.walkAtRules('layer', (rule) => {
  if (rule.nodes) rule.replaceWith(...rule.nodes)
  else rule.remove()
})
const names = new Map()
css.walkDecls((decl) => {
  if (decl.prop.startsWith('--') && !decl.prop.startsWith('--json-views-')) names.set(decl.prop, '--jv-' + decl.prop.slice(2))
})
css.walkAtRules('property', (rule) => names.set(rule.params, '--jv-' + rule.params.slice(2)))
const replaceVariables = (value) => value.replace(/--[a-zA-Z0-9_-]+/g, (name) => names.get(name) ?? name)
const animations = new Map()
css.walkAtRules(/keyframes$/, (rule) => {
  animations.set(rule.params, 'jv-' + rule.params)
  rule.params = 'jv-' + rule.params
})
css.walkDecls((decl) => {
  if (decl.prop === 'animation' || decl.prop === 'animation-name' || decl.prop.startsWith('--animate-')) {
    decl.value = decl.value.replace(/[a-zA-Z][a-zA-Z0-9_-]*/g, (value) => animations.get(value) ?? value)
  }
  decl.prop = replaceVariables(decl.prop)
  decl.value = replaceVariables(decl.value)
})
css.walkAtRules('property', (rule) => { rule.params = replaceVariables(rule.params) })
css.walkRules((rule) => {
  for (let parent = rule.parent; parent; parent = parent.parent) {
    if (parent.type === 'rule' || (parent.type === 'atrule' && parent.name.endsWith('keyframes'))) return
  }
  rule.selectors = rule.selectors.map((selector) => {
    if (/^\.json-views-(?:root|portals)(?:\b|[\s:[.#])/.test(selector)) return selector
    if (selector === ':root' || selector === ':host' || selector === 'html') return '.json-views-root'
    return '.json-views-root ' + selector
  })
})
await writeFile(file, css.toString())
await writeFile(new URL('../packages/react/dist/standalone.css', import.meta.url), await readFile(new URL('../packages/react/src/standalone.css', import.meta.url)))
