import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ANALYTICS_PREFERENCE_KEY, createAnalyticsClient, isAnalyticsEnabled, setAnalyticsEnabled, trafficSourceProperties } from './analytics.js'

beforeEach(() => localStorage.clear())

describe('minimal analytics', () => {
  it('stores the user preference locally and defaults to enabled', () => {
    expect(isAnalyticsEnabled()).toBe(true)
    setAnalyticsEnabled(false)
    expect(localStorage.getItem(ANALYTICS_PREFERENCE_KEY)).toBe('false')
    expect(isAnalyticsEnabled()).toBe(false)
  })

  it('sends anonymous events to the Script.it data plane without page or file data', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }))
    const client = createAnalyticsClient({
      dataPlaneUrl: 'https://analytics.script.it',
      fetchImpl,
      writeKey: 'frontend-write-key',
    })

    await expect(client.page({ entry: 'website' })).resolves.toBe(true)

    const [url, init] = fetchImpl.mock.calls[0]
    expect(String(url)).toBe('https://analytics.script.it/v1/track')
    const payload = JSON.parse(String(init?.body))
    expect(payload).toEqual(expect.objectContaining({
      anonymousId: expect.any(String),
      event: 'json_views_page_viewed',
      properties: expect.objectContaining({ app: 'json-views', entry: 'website' }),
    }))
    expect(JSON.stringify(payload)).not.toContain(location.href)
    expect(init).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer' })
  })

  it('does not send while analytics is disabled', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
    const client = createAnalyticsClient({
      dataPlaneUrl: 'https://analytics.script.it',
      enabled: () => false,
      fetchImpl,
      writeKey: 'frontend-write-key',
    })

    await expect(client.track('json_views_document_created')).resolves.toBe(false)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('traffic attribution', () => {
  it('keeps only the referring hostname and approved campaign values', () => {
    expect(trafficSourceProperties('https://example.com/private/user?email=secret#token', '?utm_source=github&utm_medium=referral&utm_campaign=json-views&utm_content=read-more&utm_term=secret&token=secret'))
      .toEqual({ referrer_domain: 'example.com', utm_source: 'github', utm_medium: 'referral', utm_campaign: 'json-views', utm_content: 'read-more' })
  })
  it('drops unknown values, malformed referrers, and non-web protocols', () => {
    expect(trafficSourceProperties('invalid', '?utm_campaign=private-client&utm_source=user%40example.com')).toEqual({})
    expect(trafficSourceProperties('file:///private/document', '')).toEqual({})
  })
  it('suppresses the new events and attribution after opt-out', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
    const client = createAnalyticsClient({ dataPlaneUrl: 'https://analytics.script.it', writeKey: 'test', fetchImpl })
    setAnalyticsEnabled(false)
    await client.page(trafficSourceProperties('https://example.com/private', '?utm_source=github'))
    await client.track('json_views_link_clicked', { link_id: 'agent-guide' })
    await client.track('json_views_view_selected', { template_id: 'task-management', view_id: 'task-board' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
