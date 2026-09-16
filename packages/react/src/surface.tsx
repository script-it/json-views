import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useJsonViewsDevice } from './browser-device.js'
import { ViewerStateProvider } from './viewer-state.js'
import type { JsonViewsPresentationState } from './viewer-state.js'

export type JsonViewsTheme = 'light' | 'dark' | 'inherit'

const PortalContext = createContext<HTMLElement | undefined>(undefined)
export function useJsonViewsPortalContainer(): HTMLElement | undefined {
  return useContext(PortalContext)
}

const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect
const tokens = ['background', 'foreground', 'card', 'card-foreground', 'muted', 'muted-foreground', 'accent', 'accent-foreground', 'primary', 'primary-foreground', 'border', 'input', 'ring', 'link', 'warning', 'destructive', 'destructive-border', 'destructive-surface', 'destructive-foreground']

/** Scoped theme and portal destination for one independently themed viewer. */
export function JsonViewsSurface({
  children,
  theme = 'inherit',
  portalContainer,
  presentationState,
  onPresentationStateChange,
  className,
  style,
}: {
  children: ReactNode
  theme?: JsonViewsTheme
  portalContainer?: HTMLElement | null
  presentationState?: JsonViewsPresentationState
  onPresentationStateChange?: (state: JsonViewsPresentationState) => void
  className?: string
  style?: CSSProperties
}) {
  const root = useRef<HTMLDivElement>(null)
  const [effectiveTheme, setEffectiveTheme] = useState<'light' | 'dark'>(theme === 'dark' ? 'dark' : 'light')
  const [portal, setPortal] = useState<HTMLDivElement>()
  const device = useJsonViewsDevice()

  useBrowserLayoutEffect(() => {
    if (portal) portal.dataset.jsonViewsDevice = device
  }, [device, portal])

  useBrowserLayoutEffect(() => {
    const node = document.createElement('div')
    node.className = 'json-views-root json-views-portals'
    node.dataset.jsonViewsPortal = ''
    ;(portalContainer ?? document.body).appendChild(node)
    setPortal(node)
    return () => { node.remove() }
  }, [portalContainer])

  useBrowserLayoutEffect(() => {
    const element = root.current
    if (!element) return
    const refresh = () => {
      let next: 'light' | 'dark' = theme === 'dark' ? 'dark' : 'light'
      if (theme === 'inherit') {
        for (let parent = element.parentElement; parent; parent = parent.parentElement) {
          const declared = parent.dataset.jsonViewsTheme
          if (declared === 'dark' || declared === 'light') { next = declared; break }
          if (parent.classList.contains('dark')) { next = 'dark'; break }
          if (parent.classList.contains('light')) break
        }
      }
      element.dataset.jsonViewsTheme = next
      setEffectiveTheme(next)
      if (!portal) return
      portal.dataset.jsonViewsTheme = next
      const computed = getComputedStyle(element)
      tokens.forEach((name) => {
        const value = computed.getPropertyValue('--jv-' + name).trim()
        if (value) portal.style.setProperty('--json-views-' + name, value)
        else portal.style.removeProperty('--json-views-' + name)
      })
      portal.style.fontFamily = computed.fontFamily
    }
    refresh()
    const observer = new MutationObserver(refresh)
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      observer.observe(parent, { attributes: true, attributeFilter: ['class', 'style', 'data-json-views-theme'] })
    }
    return () => { observer.disconnect() }
  }, [theme, portal, style, className])

  return (
    <PortalContext.Provider value={portal}>
      <ViewerStateProvider initialState={presentationState} onChange={onPresentationStateChange}>
      <div ref={root} className={['json-views-root', className].filter(Boolean).join(' ')} data-json-views-device={device} data-json-views-theme={effectiveTheme} style={style}>
        {children}
      </div>
      </ViewerStateProvider>
    </PortalContext.Provider>
  )
}
