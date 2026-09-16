import { createDefaultTypeRegistry } from '@script-it/json-views-core'

/** @param {unknown} value
 * @returns {value is {x: number, y: number}}
 */
export function isCoordinate(value) {
  if (value === null || typeof value !== 'object') return false
  return 'x' in value && 'y' in value
    && typeof value.x === 'number' && Number.isFinite(value.x)
    && typeof value.y === 'number' && Number.isFinite(value.y)
}

export function createEmbeddingTypeRegistry() {
  return createDefaultTypeRegistry().register({
    name: 'coordinate',
    validate: (value) => isCoordinate(value) ? undefined : 'Coordinates need finite x and y numbers',
    parse: (value) => isCoordinate(value) ? `${value.x}, ${value.y}` : '',
    serialize: (value) => {
      if (typeof value !== 'string') throw new Error('Enter coordinates as x, y')
      const parts = value.split(',').map((part) => part.trim())
      if (parts.length !== 2 || parts.some((part) => part.length === 0)) throw new Error('Enter coordinates as x, y')
      return { x: Number(parts[0]), y: Number(parts[1]) }
    },
  })
}

/** @param {'light' | 'dark'} theme */
export function documentSource(theme) {
  return JSON.stringify({
    $jsonviews: {
      version: 1,
      schema: {
        '$.record.name': { type: 'text', title: 'Name', required: true },
        '$.record.status': { type: 'select', title: 'Status', options: ['Ready', 'Review', 'Complete'] },
        '$.record.followUp': { type: 'date', title: 'Follow up' },
        '$.record.location': { type: 'coordinate', title: 'Location', required: true },
        '$.record.active': { type: 'checkbox', title: 'Active' },
        '$.record.website': { type: 'url', title: 'Website' },
      },
      views: [{ id: 'record', name: 'Record', path: '$.record' }],
    },
    record: {
      name: theme === 'light' ? 'Light document' : 'Dark document',
      status: theme === 'light' ? 'Ready' : 'Review',
      followUp: '2026-09-18',
      location: theme === 'light' ? { x: 12.5, y: 48.2 } : { x: -73.9, y: 40.7 },
      active: true,
      website: 'https://example.com',
    },
  }, null, 2)
}

