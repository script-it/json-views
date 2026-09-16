import { describe, expect, it } from 'vitest'
import { optionColorsForValues } from './option-pill.js'

describe('automatic option colors', () => {
  const values = Array.from({ length: 8 }, (_, index) => `Option ${index}`)
  it('uses all eight colors before repeating and keeps appended assignments stable', () => {
    const colors = optionColorsForValues(values)
    expect(new Set(Object.values(colors)).size).toBe(8)
    const extended = optionColorsForValues([...values, 'Extra'])
    values.forEach((value) => expect(extended[value]).toBe(colors[value]))
    expect(Object.values(extended).filter((color) => color === extended.Extra)).toHaveLength(2)
  })
  it('reserves manual choices before assigning unused colors', () => {
    const colors = optionColorsForValues(['A', 'B', 'C'], { C: 'blue' })
    expect(colors.C).toBe('blue')
    expect(new Set(Object.values(colors)).size).toBe(3)
    expect(optionColorsForValues(['A', 'B'], { A: 'pink', B: 'pink' })).toMatchObject({ A: 'pink', B: 'pink' })
  })
  it('starts each column at a different color while keeping its options distinct', () => {
    const columns = Array.from({ length: 5 }, (_, index) => optionColorsForValues(['Same', 'Other'], {}, index))
    expect(columns.map((colors) => colors.Same)).toEqual(['blue', 'green', 'yellow', 'orange', 'purple'])
    columns.forEach((colors) => expect(colors.Other).not.toBe(colors.Same))
    expect(optionColorsForValues(['Same', 'Other'], { Same: 'pink' }, 3).Same).toBe('pink')
  })
})
