import { AlertTriangle } from 'lucide-react'
import { type CompiledJsonViewMetadata } from '@script-it/json-views-core'
import { pathLabel } from './view-model.js'

function groupKey(item: CompiledJsonViewMetadata['diagnostics'][number]): string {
  return JSON.stringify([item.scope, item.code, item.message, item.severity, item.metadataPath, item.declaration, item.viewId])
}

export function Diagnostics({ compiled }: { compiled: CompiledJsonViewMetadata }) {
  if (compiled.diagnostics.length === 0) return null
  const groups = Array.from(compiled.diagnostics.reduce((result, item) => {
    const key = groupKey(item)
    const existing = result.get(key)
    if (existing) {
      existing.items.push(item)
    } else {
      result.set(key, { item, items: [item] })
    }
    return result
  }, new Map<string, { item: CompiledJsonViewMetadata['diagnostics'][number]; items: CompiledJsonViewMetadata['diagnostics'] }>()).values())
  return (
    <details data-id="jsonView-json-diagnostics" className="relative shrink-0 text-xs">
      <summary
        aria-label={`${groups.length} JSON ${groups.length === 1 ? 'issue' : 'issues'}`}
        title={`${groups.length} JSON ${groups.length === 1 ? 'issue' : 'issues'}`}
        className="flex h-7 cursor-pointer list-none items-center gap-1 rounded-md px-1.5 text-warning hover:bg-accent"
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        <span className="text-[10px] tabular-nums">{groups.length}</span>
      </summary>
      <div className="absolute right-0 top-8 z-30 max-h-[min(24rem,60vh)] w-[min(28rem,calc(100vw-2rem))] overflow-y-auto rounded-lg border border-border bg-card p-3 text-foreground shadow-lg">
        <div className="font-medium">JSON issues</div>
        <ul className="mt-2 grid gap-2">
          {groups.map(({ item, items }) => {
            const examples = items.flatMap((entry) => entry.sourcePath ? [pathLabel(entry.sourcePath)] : []).slice(0, 2)
            return (
              <li key={groupKey(item)} className="min-w-0">
                <div>{item.message}{items.length > 1 ? ` (${items.length})` : ''}</div>
                <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">{item.declaration ?? pathLabel(item.metadataPath)}</div>
                {examples.length > 0 && <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">{examples.join(', ')}</div>}
                {item.help && (
                  <details className="mt-1 rounded border border-border p-2">
                    <summary aria-label={`How to fix: ${item.message}`} className="cursor-pointer font-medium">How to fix</summary>
                    <div className="mt-2 grid gap-2 break-words">
                      <div>{item.help.fix}</div>
                      <div><span className="font-medium">Expected: </span>{item.help.expected}</div>
                      <div className="font-mono text-[10px]">{item.metadataSource === 'external' ? 'External annotations: ' : 'Annotation: '}{pathLabel(item.metadataPath)}</div>
                      {item.help.received !== undefined && <div><span className="font-medium">Received: </span><code>{item.help.received}</code></div>}
                      {item.help.allowedValues && <div><span className="font-medium">Supported: </span>{item.help.allowedValues.length ? item.help.allowedValues.join(', ') : 'No shared supported values; adjust the field types or remove this configuration.'}</div>}
                      {item.help.examples && <div><div className="font-medium">Examples</div><pre className="mt-1 whitespace-pre-wrap rounded bg-muted p-2 text-[10px]">{item.help.examples.map((example) => JSON.stringify(example, null, 2)).join('\n')}</pre></div>}
                      {item.help.capabilities && <ul className="list-disc space-y-1 pl-4">{item.help.capabilities.map((capability) => <li key={capability}>{capability}</li>)}</ul>}
                      {items.some((entry) => entry.sourcePath) && (
                        <div>
                          <div className="font-medium">Affected data{items.length > 1 ? ` (${items.length})` : ''}</div>
                          <ul className="mt-1 grid max-h-40 gap-1 overflow-y-auto font-mono text-[10px]">
                            {items.map((entry, index) => entry.sourcePath && <li key={index}>{pathLabel(entry.sourcePath)}{entry.scope === 'value' && entry.help?.received !== undefined ? `: ${entry.help.received}` : ''}</li>)}
                          </ul>
                        </div>
                      )}
                      <div className="text-[10px] text-muted-foreground">{item.severity ?? 'error'} · {item.code}</div>
                    </div>
                  </details>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </details>
  )
}
