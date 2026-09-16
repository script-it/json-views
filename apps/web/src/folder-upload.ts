export interface ImportFile {
  name: string
  webkitRelativePath?: string
  text(): Promise<string>
}

/** Filter before reading: unsupported file contents never enter the workspace. */
export async function readDocumentFiles(files: readonly ImportFile[]) {
  const documents: { content: string; filename: string; relativePath: string }[] = []
  const failures: string[] = []
  const supportedFiles = files.filter((file) => /\.(json|csv)$/i.test(file.name))
    .sort((a, b) => (a.webkitRelativePath ?? a.name).localeCompare(b.webkitRelativePath ?? b.name))
  for (const file of supportedFiles) {
    const relativePath = file.webkitRelativePath || file.name
    try {
      documents.push({ content: await file.text(), filename: file.name, relativePath })
    } catch {
      failures.push(relativePath)
    }
  }
  return { documents, failures }
}

export interface CollectedFiles {
  files: ImportFile[]
  failures: string[]
}

/** Capture entries synchronously while the drop event's data store is readable. */
export async function collectDroppedFiles(data: DataTransfer): Promise<CollectedFiles> {
  const items = Array.from(data.items ?? []).filter((item) => item.kind === 'file')
  const entries = items.map((item) => {
    const entryItem = item as DataTransferItem & { getAsEntry?: () => FileSystemEntry | null }
    return { entry: (entryItem.getAsEntry ?? entryItem.webkitGetAsEntry)?.call(item), file: item.getAsFile() }
  })
  const fallback = Array.from(data.files)
  const result: CollectedFiles = { files: [], failures: [] }
  const visit = async (entry: FileSystemEntry, parent = ''): Promise<void> => {
    const path = `${parent}${entry.name}`
    try {
      if (entry.isDirectory) {
        const reader = (entry as FileSystemDirectoryEntry).createReader()
        // Chromium returns directory entries in batches, often 100 at a time.
        while (true) {
          const children = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject))
          if (!children.length) break
          for (const child of children) await visit(child, `${path}/`)
        }
      } else if (entry.isFile && /\.(json|csv)$/i.test(entry.name)) {
        const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject))
        result.files.push({ name: file.name, webkitRelativePath: path, text: () => file.text() })
      }
    } catch {
      result.failures.push(path)
    }
  }
  if (!entries.length) result.files.push(...fallback)
  for (const { entry, file } of entries) {
    if (entry) await visit(entry)
    else if (file) result.files.push(file)
    else result.failures.push('Dropped item')
  }
  return result
}
