import { describe, expect, it } from 'vitest'
import { openDocument } from './document-model.js'
import { documentRouteHash, documentRouteUrl, documentRouteViews, findRouteDocument, readDocumentRoute, routeActiveView } from './document-route.js'

function source(names = ['Board', 'Root']) {
  return JSON.stringify({ $jsonviews: { version: 1, views: names.map((name, i) => ({ id: `v${i}`, name, path: '$.rows' })) }, rows: [{ name: 'Ada' }] })
}

describe('named document routes', () => {
  it('round-trips folder paths, Unicode, reserved characters, and literal percent encodings', () => {
    const route = { file: 'team/views/דוח #?%2F.json', view: 'Board / Ready? #100%' }
    expect(readDocumentRoute(documentRouteHash(route))).toEqual(route)
    expect(readDocumentRoute('#json=v1.u.payload')).toBeUndefined()
    expect(() => readDocumentRoute('#/files/%broken')).toThrow('encoding')
    expect(() => readDocumentRoute('#/files/a/views/b/extra')).toThrow('Invalid file link')
  })

  it('uses full folder paths and rejects ambiguous or missing destinations', () => {
    const first = openDocument(source(), 'tasks.json', { relativePath: 'team/tasks.json' })
    const second = openDocument(source(), 'tasks.json', { relativePath: 'other/tasks.json' })
    expect(findRouteDocument([first, second], 'team/tasks.json')).toBe(first)
    expect(() => findRouteDocument([first, second], 'tasks.json')).toThrow('not available')
    expect(() => findRouteDocument([first, first], 'team/tasks.json')).toThrow('More than one file')
    expect(routeActiveView(first, 'Board')).toBe('view:v0')
    expect(routeActiveView(first, 'Root')).toBe('view:v1')
    expect(routeActiveView(first)).toBe('view:v0')
    expect(() => routeActiveView(first, 'board')).toThrow('not found')
    expect(() => routeActiveView(openDocument(source(['Board', 'Board']), 'duplicate.json'), 'Board')).toThrow('More than one view')
  })

  it('matches the viewer metadata precedence and inferred views, and refreshes renamed views', () => {
    const document = openDocument(source(), 'tasks.json', { metadata: { version: 1, views: [{ name: 'External', path: '$.rows' }] } })
    expect(documentRouteViews(document).map((view) => view.name)).toEqual(['Board', 'Root'])
    document.controller.edit(source(['Renamed']))
    expect(routeActiveView(document, 'Renamed')).toBe('view:v0')
    expect(() => routeActiveView(document, 'Board')).toThrow('not found')
    expect(documentRouteViews(openDocument('{"rows":[{"name":"Ada","score":1},{"name":"Grace","score":2},{"name":"Katherine","score":3}]}', 'inferred.json')).length).toBeGreaterThan(0)
    expect(routeActiveView(openDocument('name\nAda\n', 'people.csv'))).toBe('root')
  })

  it('generates local workspace links without copying source or leaking another file token', () => {
    const document = openDocument(source(), 'tasks.json')
    const local = openDocument(source(), 'local.json', { token: 'local-token' })
    const base = 'http://localhost:3000/?token=other#json=old-payload'
    expect(documentRouteUrl(base, [document], document, 'Board')).toBe('http://localhost:3000/#/files/tasks.json/views/Board')
    expect(documentRouteUrl(base, [local], local)).toBe('http://localhost:3000/?token=local-token#/files/local.json')
    expect(() => documentRouteUrl(base, [document, openDocument(source(), 'tasks.json')], document)).toThrow('More than one file')
  })
})
