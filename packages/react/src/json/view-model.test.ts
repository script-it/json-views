import { describe, expect, it } from 'vitest'
import { resolveJsonViewRowPath } from '@script-it/json-views-core'

import { nestedRecordView } from './view-model.js'

describe('nested record view model', () => {
  it('builds absolute escaped paths for the selected title field', () => {
    const root = { groups: { 'team.alpha': [{ 'display/name': 'Ada' }] } }
    const target = nestedRecordView(root, ['groups', 'team.alpha', 0], 'display/name', 'People')
    expect(target?.view.path.source).toBe("$.groups['team.alpha'][0]")
    expect(target?.view.columns?.[0].path.source).toBe("$.groups['team.alpha'][0]['display/name']")
    expect(target && resolveJsonViewRowPath(root, target.row, target.view.columns![0].path).value).toBe('Ada')
  })
})
