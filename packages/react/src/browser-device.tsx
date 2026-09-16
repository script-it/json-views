import { createContext, useContext, type ReactNode } from 'react'

export type JsonViewsDevice = 'mobile' | 'desktop'
type BrowserIdentity = { userAgent: string; userAgentData?: { mobile: boolean } }

/**
 * Use browser identity rather than width or touch support so resizing an embed
 * doesn't switch interaction models. iPad desktop mode intentionally stays desktop;
 * hosts that need a different policy can override it with JsonViewsDeviceProvider.
 */
export function detectBrowserDevice(browser?: BrowserIdentity): JsonViewsDevice {
  if (!browser) return 'desktop'
  const mobile = browser.userAgentData?.mobile
    ?? /Android|iPhone|iPad|iPod|Mobile/i.test(browser.userAgent)
  return mobile ? 'mobile' : 'desktop'
}

const DeviceContext = createContext<JsonViewsDevice | undefined>(undefined)

/** Optional host override, useful for previews; all viewer surfaces and portals share it. */
export function JsonViewsDeviceProvider({ device, children }: { device?: JsonViewsDevice; children: ReactNode }) {
  return <DeviceContext.Provider value={device}>{children}</DeviceContext.Provider>
}

export function useJsonViewsDevice(): JsonViewsDevice {
  return useContext(DeviceContext) ?? detectBrowserDevice(typeof navigator === 'undefined' ? undefined : navigator)
}
