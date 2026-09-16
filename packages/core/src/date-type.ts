export type DateValue = string | null

export type ParsedDateKind = 'empty' | 'date' | 'datetime' | 'floating-datetime' | 'invalid'

export interface ParsedDateResult {
  kind: ParsedDateKind
  source: unknown
  calendarDate?: string
  year?: number
  month?: number
  day?: number
  hour?: number
  minute?: number
  second?: number
  fractionalSeconds?: string
  timezone?: string
  offsetMinutes?: number
  epochSeconds?: number
  error?: string
}

export interface DateTypeDescriptor {
  type: 'date'
  title?: string
  description?: string
  required?: boolean
  minimum?: DateValue
  maximum?: DateValue
  defaultIncludeTime?: boolean
  placeholder?: string
  [key: string]: unknown
}

export interface DateEditorValue {
  date: string
  includeTime: boolean
  time?: string
  seconds?: number
  fractionalSeconds?: string
  timezone?: string
}

export const DATE_FILTER_OPERATORS = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'isEmpty',
  'isNotEmpty',
] as const

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const DATETIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/

function leapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return leapYear(year) ? 29 : 28
  return [4, 6, 9, 11].includes(month) ? 30 : 31
}

function validCalendarDate(year: number, month: number, day: number): boolean {
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month)
}

export function parseFixedOffset(value: string): number | undefined {
  if (value === 'Z') return 0
  const match = /^([+-])(\d{2}):(\d{2})$/.exec(value)
  if (!match) return undefined
  const hours = Number(match[2])
  const minutes = Number(match[3])
  if (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0)) return undefined
  const total = hours * 60 + minutes
  return match[1] === '-' ? -total : total
}

export function formatFixedOffset(offsetMinutes: number): string {
  if (!Number.isInteger(offsetMinutes) || Math.abs(offsetMinutes) > 14 * 60) {
    throw new TypeError('Timezone offset must be a whole number of minutes between -14:00 and +14:00')
  }
  if (offsetMinutes === 0) return 'Z'
  const sign = offsetMinutes < 0 ? '-' : '+'
  const absolute = Math.abs(offsetMinutes)
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`
}

function epochSecondsFor(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  offsetMinutes: number,
): number {
  const instant = new Date(0)
  instant.setUTCFullYear(year, month - 1, day)
  instant.setUTCHours(hour, minute, second, 0)
  return Math.floor(instant.getTime() / 1000) - offsetMinutes * 60
}

export function parseDateValue(value: unknown): ParsedDateResult {
  if (value === null || value === undefined) return { kind: 'empty', source: value }
  if (typeof value !== 'string' || value === '') {
    return { kind: 'invalid', source: value, error: 'Enter a valid date or date and time' }
  }

  const date = DATE_PATTERN.exec(value)
  if (date) {
    const [, yearText, monthText, dayText] = date
    const year = Number(yearText)
    const month = Number(monthText)
    const day = Number(dayText)
    if (!validCalendarDate(year, month, day)) {
      return { kind: 'invalid', source: value, error: 'Enter a real calendar date' }
    }
    return { kind: 'date', source: value, calendarDate: value, year, month, day }
  }

  const datetime = DATETIME_PATTERN.exec(value)
  if (!datetime) return { kind: 'invalid', source: value, error: 'Use YYYY-MM-DD or an RFC 3339 date and time' }
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fractionText, timezone] = datetime
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const hour = Number(hourText)
  const minute = Number(minuteText)
  const second = Number(secondText)
  if (!validCalendarDate(year, month, day) || hour > 23 || minute > 59 || second > 59) {
    return { kind: 'invalid', source: value, error: 'Enter a real calendar date and valid time' }
  }
  const calendarDate = `${yearText}-${monthText}-${dayText}`
  const common = {
    source: value,
    calendarDate,
    year,
    month,
    day,
    hour,
    minute,
    second,
    fractionalSeconds: fractionText?.slice(1) ?? '',
  }
  if (!timezone) {
    return { ...common, kind: 'floating-datetime' }
  }
  const offsetMinutes = parseFixedOffset(timezone)
  if (offsetMinutes === undefined) {
    return { kind: 'invalid', source: value, error: 'Enter a valid timezone offset' }
  }
  return {
    ...common,
    kind: 'datetime',
    timezone,
    offsetMinutes,
    epochSeconds: epochSecondsFor(year, month, day, hour, minute, second, offsetMinutes),
  }
}

function compareFractions(left = '', right = ''): number {
  const width = Math.max(left.length, right.length)
  const normalizedLeft = left.padEnd(width, '0')
  const normalizedRight = right.padEnd(width, '0')
  return normalizedLeft < normalizedRight ? -1 : normalizedLeft > normalizedRight ? 1 : 0
}

function validForOrdering(parsed: ParsedDateResult): boolean {
  return parsed.kind === 'date' || parsed.kind === 'datetime' || parsed.kind === 'floating-datetime'
}

/** Calendar dates and floating times use their written fields on a UTC reference axis.
 * Zoned times use their actual instant. Kind breaks midnight ties consistently.
 */
function ascendingDateComparison(left: ParsedDateResult, right: ParsedDateResult): number {
  const seconds = (value: ParsedDateResult): number => value.epochSeconds ?? epochSecondsFor(
    value.year ?? 0, value.month ?? 1, value.day ?? 1,
    value.hour ?? 0, value.minute ?? 0, value.second ?? 0, 0,
  )
  const rank = (value: ParsedDateResult): number => value.kind === 'date' ? 0 : value.kind === 'floating-datetime' ? 1 : 2
  return seconds(left) - seconds(right)
    || compareFractions(left.fractionalSeconds, right.fractionalSeconds)
    || rank(left) - rank(right)
}

export function compareDateValues(left: unknown, right: unknown, direction: 'asc' | 'desc' = 'asc'): number {
  const parsedLeft = parseDateValue(left)
  const parsedRight = parseDateValue(right)
  const leftValid = validForOrdering(parsedLeft)
  const rightValid = validForOrdering(parsedRight)
  if (!leftValid || !rightValid) {
    if (leftValid) return -1
    if (rightValid) return 1
    return 0
  }
  const result = ascendingDateComparison(parsedLeft, parsedRight)
  return result === 0 ? 0 : direction === 'desc' ? -result : result
}

export function matchesDateFilter(value: unknown, operator: string, expected: unknown): boolean | undefined {
  if (!DATE_FILTER_OPERATORS.includes(operator as (typeof DATE_FILTER_OPERATORS)[number])) return undefined
  const parsed = parseDateValue(value)
  const empty = parsed.kind === 'empty'
  if (operator === 'isEmpty') return empty
  if (operator === 'isNotEmpty') return !empty
  if (!validForOrdering(parsed)) return false
  const filter = parseDateValue(expected)
  if (!validForOrdering(filter)) return false

  // A calendar-day predicate compares written days for every relational operator.
  const order = filter.kind === 'date'
    ? String(parsed.calendarDate).localeCompare(String(filter.calendarDate))
    : compareDateValues(value, expected)
  if (operator === 'eq') return order === 0
  if (operator === 'neq') return order !== 0
  if (operator === 'gt') return order > 0
  if (operator === 'gte') return order >= 0
  if (operator === 'lt') return order < 0
  return order <= 0
}

function validateBound(value: ParsedDateResult, bound: unknown, edge: 'minimum' | 'maximum'): string | undefined {
  if (typeof bound !== 'string') return undefined
  const parsedBound = parseDateValue(bound)
  if (!validForOrdering(parsedBound)) return undefined
  const order = parsedBound.kind === 'date'
    ? String(value.calendarDate).localeCompare(parsedBound.calendarDate ?? '')
    : compareDateValues(value.source, bound)
  if (edge === 'minimum' && order < 0) return `Date must be on or after ${bound}`
  if (edge === 'maximum' && order > 0) return `Date must be on or before ${bound}`
  return undefined
}

export function validateDateValue(value: unknown, descriptor: DateTypeDescriptor): string | undefined {
  if (value === null || value === undefined) return descriptor.required ? 'A value is required' : undefined
  const parsed = parseDateValue(value)
  if (!validForOrdering(parsed)) return parsed.error ?? 'Enter a valid date or date and time'
  return validateBound(parsed, descriptor.minimum, 'minimum')
    ?? validateBound(parsed, descriptor.maximum, 'maximum')
}

export function dateValueWarnings(_value: unknown): string[] {
  return []
}

export function serializeDateEditorValue(value: DateEditorValue): string {
  const parsedDate = parseDateValue(value.date)
  if (parsedDate.kind !== 'date') throw new TypeError('Select a valid calendar date')
  if (!value.includeTime) return value.date
  const time = /^(\d{2}):(\d{2})$/.exec(value.time ?? '')
  if (!time || Number(time[1]) > 23 || Number(time[2]) > 59) throw new TypeError('Enter a valid time')
  if (value.timezone && parseFixedOffset(value.timezone) === undefined) throw new TypeError('Select a valid timezone')
  const seconds = value.seconds ?? 0
  if (!Number.isInteger(seconds) || seconds < 0 || seconds > 59) throw new TypeError('Enter valid seconds')
  const fraction = value.fractionalSeconds
    ? `.${value.fractionalSeconds}`
    : ''
  if (fraction && !/^\.\d+$/.test(fraction)) throw new TypeError('Enter valid fractional seconds')
  return `${value.date}T${value.time}:${String(seconds).padStart(2, '0')}${fraction}${value.timezone ?? ''}`
}

export function convertDateTimeToOffset(value: string, timezone: string): string {
  const parsed = parseDateValue(value)
  if (parsed.kind !== 'datetime' || parsed.epochSeconds === undefined) throw new TypeError('A timezone-aware date and time is required')
  const offsetMinutes = parseFixedOffset(timezone)
  if (offsetMinutes === undefined) throw new TypeError('Select a valid timezone')
  const written = new Date((parsed.epochSeconds + offsetMinutes * 60) * 1000)
  const date = `${String(written.getUTCFullYear()).padStart(4, '0')}-${String(written.getUTCMonth() + 1).padStart(2, '0')}-${String(written.getUTCDate()).padStart(2, '0')}`
  const time = `${String(written.getUTCHours()).padStart(2, '0')}:${String(written.getUTCMinutes()).padStart(2, '0')}`
  return serializeDateEditorValue({
    date,
    includeTime: true,
    time,
    seconds: written.getUTCSeconds(),
    fractionalSeconds: parsed.fractionalSeconds,
    timezone,
  })
}

export function localOffsetForDate(date: string, time = '12:00'): string {
  const local = new Date(`${date}T${time}:00`)
  return formatFixedOffset(-local.getTimezoneOffset())
}
