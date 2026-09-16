// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { detectBrowserDevice, JsonViewsDeviceProvider } from './browser-device.js'
import { JsonViewsSurface } from './surface.js'

describe('browser device identity', () => {
  it('honors explicit browser hints over user-agent tokens', () => {
    expect(detectBrowserDevice({ userAgent: 'Android Mobile', userAgentData: { mobile: false } })).toBe('desktop')
    expect(detectBrowserDevice({ userAgent: 'Unknown', userAgentData: { mobile: true } })).toBe('mobile')
  })

  it('falls back to mobile user agents without relying on viewport or touch input', () => {
    for (const userAgent of ['iPhone', 'iPad', 'Android', 'Firefox Mobile']) {
      expect(detectBrowserDevice({ userAgent })).toBe('mobile')
    }
    expect(detectBrowserDevice({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)' })).toBe('desktop')
    expect(detectBrowserDevice({ userAgent: 'Windows NT 10.0' })).toBe('desktop')
    expect(detectBrowserDevice()).toBe('desktop')
  })

  it('keeps surfaces and portals on the same device identity regardless of width', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    try {
      for (const [device, width] of [['mobile', 1200], ['desktop', 320]] as const) {
        await act(async () => root.render(
          <JsonViewsDeviceProvider device={device}>
            <JsonViewsSurface style={{ width }}>Content</JsonViewsSurface>
          </JsonViewsDeviceProvider>,
        ))
        expect(container.querySelector('.json-views-root')?.getAttribute('data-json-views-device')).toBe(device)
        expect(document.querySelector('.json-views-portals')?.getAttribute('data-json-views-device')).toBe(device)
      }
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })
})
