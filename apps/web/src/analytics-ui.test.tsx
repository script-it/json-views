import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { App } from './App.js'
import { analytics } from './analytics.js'
import * as browserWorkspace from './browser-workspace.js'
import { documentRouteHash } from './document-route.js'

let cleanup: (() => Promise<void>) | undefined
afterEach(async () => {
  await cleanup?.()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  history.replaceState(null, '', '/')
})

it('reports built-in navigation and agent-guide clicks without custom view labels', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const track = vi.spyOn(analytics, 'track').mockResolvedValue(true)
  vi.spyOn(analytics, 'page').mockResolvedValue(true)
  vi.spyOn(browserWorkspace, 'readBrowserWorkspace').mockResolvedValue(undefined)
  vi.spyOn(browserWorkspace, 'writeBrowserWorkspace').mockImplementation(async (workspace) => ({ workspace, conflicts: [] }))
  const source = JSON.stringify({
    $jsonviews: { version: 1, views: [
      { id: 'welcome', name: 'Welcome', path: '$.rows' },
      { id: 'private-client', name: 'Secret client', path: '$.rows' },
    ] }, rows: [{ name: 'Private content' }],
  })
  vi.stubGlobal('fetch', vi.fn(async (url) => new Response(String(url).endsWith('manifest.json')
    ? JSON.stringify([{ sourceFile: 'About JSON Views.json', title: 'About JSON Views' }]) : source)))
  history.replaceState(null, '', `/${documentRouteHash({ file: 'About JSON Views.json', view: 'Welcome' })}`)
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  cleanup = async () => { await act(async () => root.unmount()); container.remove() }
  await act(async () => root.render(<App />))
  expect(track).toHaveBeenCalledWith('json_views_view_selected', { template_id: 'json-views', view_id: 'welcome', interface: 'ui' })
  expect(track.mock.calls.filter(([event]) => event === 'json_views_view_selected')).toHaveLength(1)
  track.mockClear()
  const guide = container.querySelector<HTMLAnchorElement>('.agent-guide-trigger')!
  guide.addEventListener('click', (event) => event.preventDefault())
  await act(async () => { guide.click() })
  expect(track).toHaveBeenCalledWith('json_views_link_clicked', { link_id: 'agent-guide', interface: 'ui' })
  await act(async () => {
    history.replaceState(null, '', `/${documentRouteHash({ file: 'About JSON Views.json', view: 'Secret client' })}`)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
  expect(track.mock.calls.some(([event]) => event === 'json_views_view_selected')).toBe(false)
  expect(JSON.stringify(track.mock.calls)).not.toMatch(/Secret client|private-client|Private content/)
  await act(async () => { container.querySelector<HTMLButtonElement>('[aria-label="Open About JSON Views.json"]')!.click() })
  expect(track).toHaveBeenCalledWith('json_views_link_clicked', { template_id: 'json-views', link_id: 'template-navigation', interface: 'ui' })
  expect(track).toHaveBeenCalledWith('json_views_document_opened', expect.objectContaining({ template_id: 'json-views', method: 'navigation' }))
  expect(track.mock.calls.filter(([event]) => event === 'json_views_view_selected')).toHaveLength(1)
})
