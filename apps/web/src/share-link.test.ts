import { describe, expect, it } from 'vitest'
import {
  createShareLink, hasShareHash, MAX_SHARE_LINK_LENGTH, readShareHash,
} from './share-link.js'

describe('share links', () => {
  it('round-trips the exact JSON source and Unicode filename through a server-private fragment', async () => {
    const document = {
      filename: 'תכנון.json',
      source: '{ "id":9007199254740993,"minusZero":-0,"emoji":"🏔️" }\r\n',
    }
    const shared = await createShareLink(document)
    const url = new URL(shared.url)

    expect(url.origin).toBe('https://json-views.com')
    expect(url.search).toBe('')
    expect(url.hash).toMatch(/^#json=v1\.g\./)
    expect(shared.length).toBeLessThanOrEqual(MAX_SHARE_LINK_LENGTH)
    expect(hasShareHash(url.hash)).toBe(true)
    await expect(readShareHash(url.hash)).resolves.toEqual(document)
  })

  it('round-trips exact CSV source through a CSV fragment', async () => {
    const document = {
      filename: 'אנשים.csv',
      source: '\ufeffid,name\r\n001,"Ada, Lovelace"\r\n',
    }
    const shared = await createShareLink(document)
    const url = new URL(shared.url)

    expect(url.hash).toMatch(/^#csv=v1\.g\./)
    expect(hasShareHash(url.hash)).toBe(true)
    await expect(readShareHash(url.hash)).resolves.toEqual(document)
  })

  it('ignores unrelated fragments and rejects malformed shared payloads', async () => {
    expect(hasShareHash('#details')).toBe(false)
    await expect(readShareHash('#details')).resolves.toBeUndefined()
    await expect(readShareHash('#json=v2.g.invalid')).rejects.toThrow('format is not supported')
    await expect(readShareHash('#csv=v1.g.invalid')).rejects.toThrow()
    await expect(readShareHash('#json=v1.g.invalid&csv=v1.g.invalid')).rejects.toThrow('more than one document')
  })

  it('allows links beyond the reliable sharing limit with a warning', async () => {
    let state = 123456789
    const values = Array.from({ length: 12_000 }, () => {
      state = (state * 1664525 + 1013904223) >>> 0
      return state.toString(36).padStart(7, '0')
    })
    const shared = await createShareLink({ filename: 'large.json', source: JSON.stringify(values) })
    expect(shared.length).toBeGreaterThan(MAX_SHARE_LINK_LENGTH)
    expect(shared.warning).toBe(true)
    await expect(readShareHash(new URL(shared.url).hash)).resolves.toEqual({ filename: 'large.json', source: JSON.stringify(values) })
  })
})
