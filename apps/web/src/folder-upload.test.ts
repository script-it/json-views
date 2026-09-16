import { expect, it, vi } from 'vitest'
import { readDocumentFiles } from './folder-upload.js'

it('reads only JSON and CSV files, preserving nested paths, same-name files and invalid JSON source', async () => {
  const skipped = vi.fn()
  const result = await readDocumentFiles([
    { name: 'item.json', webkitRelativePath: 'data/a/item.json', text: async () => '{"a":1}' },
    { name: 'item.JSON', webkitRelativePath: 'data/b/item.JSON', text: async () => '{broken' },
    { name: 'notes.CSV', webkitRelativePath: 'data/other/notes.CSV', text: async () => 'name\nAda\n' },
    { name: 'notes.txt', webkitRelativePath: 'data/notes.txt', text: skipped },
    { name: 'item.json.bak', webkitRelativePath: 'data/item.json.bak', text: skipped },
    { name: 'failed.json', webkitRelativePath: 'data/failed.json', text: async () => { throw new Error('Unreadable') } },
  ])
  expect(skipped).not.toHaveBeenCalled()
  expect(result.documents).toEqual([
    { filename: 'item.json', relativePath: 'data/a/item.json', content: '{"a":1}' },
    { filename: 'item.JSON', relativePath: 'data/b/item.JSON', content: '{broken' },
    { filename: 'notes.CSV', relativePath: 'data/other/notes.CSV', content: 'name\nAda\n' },
  ])
  expect(result.failures).toEqual(['data/failed.json'])
})

function fileEntry(name: string, text = '{}') {
  const read = vi.fn((resolve: (file: File) => void) => resolve({ name, text: async () => text } as File))
  return { name, isFile: true, isDirectory: false, file: read } as unknown as FileSystemFileEntry
}

function folderEntry(name: string, batches: FileSystemEntry[][]) {
  let index = 0
  return { name, isFile: false, isDirectory: true, createReader: () => ({
    readEntries: (resolve: (entries: FileSystemEntry[]) => void) => resolve(batches[index++] ?? []),
  }) } as unknown as FileSystemDirectoryEntry
}

it('captures every dropped item before awaiting and drains all directory batches', async () => {
  const { collectDroppedFiles } = await import('./folder-upload.js')
  const ignored = fileEntry('skip.txt')
  const root = folderEntry('Project', [
    Array.from({ length: 100 }, (_, i) => fileEntry(`${i}.json`)),
    [folderEntry('nested', [[fileEntry('people.csv', 'name\nAda\n'), ignored]])],
  ])
  const capture = vi.fn(() => fileEntry('extra.json'))
  const result = collectDroppedFiles({
    items: [
      { kind: 'file', webkitGetAsEntry: () => root, getAsFile: () => null },
      { kind: 'file', webkitGetAsEntry: capture, getAsFile: () => null },
    ], files: [],
  } as unknown as DataTransfer)
  expect(capture).toHaveBeenCalledOnce()
  const collected = await result
  expect(collected.failures).toEqual([])
  expect(collected.files).toHaveLength(102)
  expect(ignored.file).not.toHaveBeenCalled()
  const read = await readDocumentFiles(collected.files)
  expect(read.documents).toContainEqual({ filename: 'people.csv', relativePath: 'Project/nested/people.csv', content: 'name\nAda\n' })
})

it('supports plain-file drops without directory APIs and continues past unreadable entries', async () => {
  const { collectDroppedFiles } = await import('./folder-upload.js')
  const file = { name: 'plain.csv', text: async () => 'name\nAda\n' } as File
  const fallback = await collectDroppedFiles({ items: [], files: [file] } as unknown as DataTransfer)
  expect(fallback.files).toEqual([file])
  const broken = { name: 'broken', isDirectory: true, createReader: () => { throw new Error('Denied') } }
  const result = await collectDroppedFiles({ items: [
    { kind: 'file', webkitGetAsEntry: () => broken, getAsFile: () => null },
    { kind: 'file', getAsFile: () => file },
  ], files: [] } as unknown as DataTransfer)
  expect(result.files).toEqual([file])
  expect(result.failures).toEqual(['broken'])
})
