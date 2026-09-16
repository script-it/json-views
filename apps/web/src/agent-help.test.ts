import { describe, expect, it } from 'vitest'
import { applyJsonViewViewRows, compileJsonViewMetadata } from '@script-it/json-views-core'
import { CONSOLE_HELP } from './console-api.js'

describe('agent help example', () => {
  it('compiles the documented schema and renders the table, board, and page', () => {
    const examples = [...CONSOLE_HELP.matchAll(/```json\n([\s\S]*?)\n```/g)]
    const values = examples.map(([, source]) => JSON.parse(source))
    for (const example of values) expect(compileJsonViewMetadata(example).diagnostics).toEqual([])
    const value = values.find((example) => example.$jsonviews?.views?.some((view: { id?: string }) => view.id === 'open-tasks'))
    expect(value).toBeDefined()
    const compiled = compileJsonViewMetadata(value)
    expect(compiled.diagnostics).toEqual([])
    expect(compiled.views.map(({ id, display }) => ({ id, display }))).toEqual([
      { id: 'open-tasks', display: 'adaptive' },
      { id: 'task-board', display: 'kanban' },
      { id: 'first-task', display: 'adaptive' },
      { id: 'task-layout', display: 'html' },
    ])
    const table = compiled.views[0]
    expect(applyJsonViewViewRows(value, table, compiled.schema).map(row => row.value.title))
      .toEqual(['Draft the guide', 'Review the example'])
    value.tasks[0].status = 'Done'
    expect(applyJsonViewViewRows(value, table, compiled.schema).map(row => row.value.title))
      .toEqual(['Review the example'])
    expect(applyJsonViewViewRows(value, compiled.views[1], compiled.schema)).toHaveLength(2)
    expect(compiled.views[2].value).toBe(value.tasks[0])
  })
})
