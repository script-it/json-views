// @vitest-environment jsdom

import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderComponent, type RenderResult } from '../test/render.js'
import { CopyJsonAction } from './copy-json-action.js'

let rendered: RenderResult | null = null

afterEach(async () => {
  await rendered?.cleanup()
  rendered = null
  vi.restoreAllMocks()
})

describe('CopyJsonAction', () => {
  it('keeps Copied fixed and animates only the two format labels', async () => {
    const previousClipboard = navigator.clipboard
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn(async () => {}) } })
    const animated: HTMLElement[] = []
    const previousAnimate = HTMLElement.prototype.animate
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value(this: HTMLElement) {
        animated.push(this)
        return {} as Animation
      },
    })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      const left = this.parentElement?.getAttribute('aria-pressed') === 'true' ? 10 : 80
      return { bottom: 20, height: 10, left, right: left + 20, top: 10, width: 20, x: left, y: 10, toJSON: () => ({}) }
    })

    try {
      rendered = await renderComponent(
        <CopyJsonAction
          dataId="copy-test"
          getPathText={() => 'data.json#/0'}
          getRecordText={() => '{"name":"Ada"}'}
          label="Copy path"
          pathLabel="path"
          recordLabel="record"
        />,
      )
      await act(async () => {
        rendered?.container.querySelector<HTMLButtonElement>('[data-id="copy-test"]')?.click()
        await Promise.resolve()
      })
      await act(async () => {
        rendered?.container.querySelector<HTMLButtonElement>('[data-copy-format="record"]')?.click()
        await Promise.resolve()
      })

      expect(animated.map((element) => element.textContent).sort()).toEqual(['Path', 'record'])
      expect(animated.every((element) => element.tagName === 'SPAN')).toBe(true)
      expect(animated.some((element) => element.textContent === 'Copied')).toBe(false)
    } finally {
      Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: previousAnimate })
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: previousClipboard })
    }
  })
})
