export const ANALYTICS_PREFERENCE_KEY = 'json-views-analytics-enabled'

type AnalyticsProperties = Record<string, boolean | number | string | undefined>

interface AnalyticsClientOptions {
  dataPlaneUrl: string
  enabled?: () => boolean
  fetchImpl?: typeof fetch
  writeKey: string
}

let volatileAnalyticsPreference: boolean | undefined

function identifier(): string {
  try { return crypto.randomUUID() } catch { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}` }
}

export function isAnalyticsEnabled(): boolean {
  try { return localStorage.getItem(ANALYTICS_PREFERENCE_KEY) !== 'false' } catch { return volatileAnalyticsPreference ?? true }
}

export function setAnalyticsEnabled(enabled: boolean): void {
  volatileAnalyticsPreference = enabled
  try { localStorage.setItem(ANALYTICS_PREFERENCE_KEY, String(enabled)) } catch { /* The setting lasts for this page only when storage is unavailable. */ }
}

export function createAnalyticsClient({ dataPlaneUrl, enabled = isAnalyticsEnabled, fetchImpl, writeKey }: AnalyticsClientOptions) {
  // Deliberately ephemeral: events can be grouped within one page load, but no
  // analytics identifier is persisted in cookies or browser storage.
  const anonymousId = identifier()

  const track = async (event: string, properties: AnalyticsProperties = {}): Promise<boolean> => {
    if (!enabled() || !writeKey || !dataPlaneUrl) return false
    try {
      const request = fetchImpl ?? globalThis.fetch
      const endpoint = new URL('/v1/track', `${dataPlaneUrl.replace(/\/$/, '')}/`)
      const response = await request(endpoint, {
        method: 'POST',
        headers: {
          authorization: `Basic ${btoa(`${writeKey}:`)}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          anonymousId,
          event,
          messageId: identifier(),
          timestamp: new Date().toISOString(),
          context: {
            app: {
              name: 'JSON Views',
              namespace: 'com.scriptit.json-views.web',
              version: import.meta.env.VITE_APP_VERSION || '0.0.0-managed',
            },
          },
          properties: {
            ...properties,
            app: 'json-views',
            platform: 'web',
            source: 'frontend',
          },
        }),
        credentials: 'omit',
        keepalive: true,
        referrerPolicy: 'no-referrer',
      })
      return response.ok
    } catch {
      return false
    }
  }

  return {
    page: (properties?: AnalyticsProperties) => track('json_views_page_viewed', properties),
    track,
  }
}

export const analytics = createAnalyticsClient({
  dataPlaneUrl: import.meta.env.VITE_RUDDERSTACK_DATA_PLANE_URL || 'https://analytics.script.it',
  writeKey: import.meta.env.VITE_RUDDERSTACK_WRITE_KEY || '',
})

// Exact campaign vocabulary: arbitrary query values (including personal data) are dropped.
export const APPROVED_CAMPAIGNS: Record<string, readonly string[]> = {
  utm_source: ['scriptit', 'github', 'linkedin', 'newsletter', 'chatgpt', 'claude', 'codex'],
  utm_medium: ['social', 'email', 'referral', 'organic'],
  utm_campaign: ['launch', 'json-views'],
  utm_content: ['agent-button', 'example-card', 'read-more'],
}

export function trafficSourceProperties(referrer: string, search: string): AnalyticsProperties {
  const properties: AnalyticsProperties = {}
  try {
    const url = new URL(referrer)
    if (url.protocol === 'https:' || url.protocol === 'http:') properties.referrer_domain = url.hostname
  } catch { /* Direct visits have no referrer. */ }
  const params = new URLSearchParams(search)
  for (const [key, values] of Object.entries(APPROVED_CAMPAIGNS)) {
    const value = params.get(key)
    if (value && values.includes(value)) properties[key] = value
  }
  return properties
}
