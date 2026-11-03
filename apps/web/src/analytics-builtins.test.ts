import { describe, expect, it } from 'vitest'
import { openDocument } from './document-model.js'
import { builtinAnalyticsProperties, builtinViewAnalyticsProperties, registerAnalyticsBuiltin } from './analytics-builtins.js'

describe('built-in analytics provenance', () => {
  it('does not identify uploaded or restored documents by filename or ID', () => {
    const user = openDocument('{}', 'Task Management.json', { id: 'example:Templates/Task Management.json' })
    expect(builtinAnalyticsProperties(user)).toEqual({})
    expect(builtinViewAnalyticsProperties(user, 'view:task-board')).toBeUndefined()
  })

  it('reports only reviewed IDs even after document content or labels change', () => {
    const bundled = openDocument('{}', 'Task Management.json')
    registerAnalyticsBuiltin(bundled, 'Task Management.json')
    const edited = { ...bundled, filename: 'private-client.json', label: 'private-client' }
    expect(builtinAnalyticsProperties(edited)).toEqual({ template_id: 'task-management' })
    expect(builtinViewAnalyticsProperties(edited, 'view:task-board')).toEqual({ template_id: 'task-management', view_id: 'task-board' })
    expect(builtinViewAnalyticsProperties(edited, 'view:private-client')).toBeUndefined()
    expect(builtinAnalyticsProperties(openDocument('{}', 'private-client.json'))).toEqual({})
  })
})
