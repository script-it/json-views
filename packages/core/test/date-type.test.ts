import { describe, expect, it } from 'vitest'

import {
  compareDateValues,
  convertDateTimeToOffset,
  dateValueWarnings,
  matchesDateFilter,
  parseDateValue,
  serializeDateEditorValue,
  validateDateValue,
} from '../src/date-type'
import { createDefaultTypeRegistry } from '../src/type-registry'

describe('JSON Views date type', () => {
  it('parses calendar dates and timezone-aware RFC 3339 values strictly', () => {
    expect(parseDateValue('2028-02-29').kind).toBe('date')
    expect(parseDateValue('2026-09-04T15:30:00+03:00')).toMatchObject({
      kind: 'datetime',
      calendarDate: '2026-09-04',
      hour: 15,
      minute: 30,
      timezone: '+03:00',
    })
    expect(parseDateValue('2026-09-04T12:30:00.125Z')).toMatchObject({ kind: 'datetime', fractionalSeconds: '125' })
    for (const invalid of ['2026-02-29', '2026-13-01', '09/04/2026', 1756999800, '2026-09-04T24:00:00Z', '2026-09-04T15:30:00+15:00']) {
      expect(parseDateValue(invalid).kind).toBe('invalid')
    }
  })

  it('accepts floating timezone-less datetimes without warnings', () => {
    expect(parseDateValue('2026-09-04T15:30:00')).toMatchObject({
      kind: 'floating-datetime',
      calendarDate: '2026-09-04',
      hour: 15,
      minute: 30,
    })
    expect(validateDateValue('2026-09-04T15:30:00', { type: 'date' })).toBeUndefined()
    expect(dateValueWarnings('2026-09-04T15:30:00')).toEqual([])
  })

  it('rejects empty strings, enforces requiredness, and applies date bounds', () => {
    const registry = createDefaultTypeRegistry()
    expect(registry.validate(null, { type: 'date' })).toBeUndefined()
    expect(registry.validate('', { type: 'date' })).toMatch(/valid date/i)
    expect(registry.validate(null, { type: 'date', required: true })).toBe('A value is required')
    expect(validateDateValue('2025-12-31', { type: 'date', minimum: '2026-01-01' })).toContain('on or after')
    expect(validateDateValue('2027-01-01T00:00:00Z', { type: 'date', maximum: '2026-12-31' })).toContain('on or before')
    expect(validateDateValue('2026-06-01T23:59:59-05:00', { type: 'date', minimum: '2026-06-01', maximum: '2026-06-01' })).toBeUndefined()
  })

  it('serializes seconds and converts offsets without changing the instant', () => {
    expect(serializeDateEditorValue({ date: '2026-09-04', includeTime: false })).toBe('2026-09-04')
    expect(serializeDateEditorValue({ date: '2026-09-04', includeTime: true, time: '15:30', seconds: 0, timezone: '+03:00' }))
      .toBe('2026-09-04T15:30:00+03:00')
    expect(serializeDateEditorValue({ date: '2026-09-04', includeTime: true, time: '15:30', seconds: 0 }))
      .toBe('2026-09-04T15:30:00')
    expect(convertDateTimeToOffset('2026-09-04T12:30:00Z', '+03:00')).toBe('2026-09-04T15:30:00+03:00')
  })

  it('compares instants, calendar days, mixed values, and invalid values', () => {
    expect(compareDateValues('2026-09-04T12:30:00Z', '2026-09-04T15:30:00+03:00')).toBe(0)
    expect(compareDateValues('2026-09-04', '2026-09-04T00:00:00Z')).toBeLessThan(0)
    expect(compareDateValues('invalid', '2026-09-04', 'desc')).toBeGreaterThan(0)
    expect(matchesDateFilter('2026-09-04T23:59:00-05:00', 'eq', '2026-09-04')).toBe(true)
    expect(matchesDateFilter('2026-09-05T00:00:00Z', 'lt', '2026-09-06')).toBe(true)
  })
})
