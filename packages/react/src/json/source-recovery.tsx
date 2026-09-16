import { Component, useState, type ReactNode } from 'react'

/** Keeps the original source recoverable when annotations or a plugin fail. */
export function JsonSourceRecovery({ source, error, onCommit }: {
  source: string
  error: string
  onCommit?: (source: string) => Promise<void>
}) {
  const [draft, setDraft] = useState(source)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string>()
  return <section className="grid min-h-0 gap-3 p-4">
    <p role="alert" className="text-sm text-destructive">{error}</p>
    <label className="grid min-h-0 gap-2 text-sm">JSON source
      <textarea aria-label="JSON source" className="min-h-64 w-full rounded-md border border-border bg-background p-3 font-mono text-xs text-foreground" value={draft} readOnly={!onCommit} onChange={(event) => setDraft(event.target.value)} />
    </label>
    {onCommit && <button type="button" disabled={saving} className="w-fit rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50" onClick={() => { void (async () => {
      setSaving(true)
      setSaveError(undefined)
      try { JSON.parse(draft); await onCommit(draft) }
      catch (cause) { setSaveError(cause instanceof Error ? cause.message : 'Could not save the source') }
      finally { setSaving(false) }
    })() }}>{saving ? 'Saving…' : 'Save JSON source'}</button>}
    {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
  </section>
}

export class JsonRendererBoundary extends Component<{
  children: ReactNode
  source: string
  onCommit?: (source: string) => Promise<void>
}, { error?: string; source?: string }> {
  state: { error?: string; source?: string } = { source: this.props.source }
  static getDerivedStateFromProps(props: { source: string }, state: { source?: string }) {
    return props.source !== state.source ? { source: props.source, error: undefined } : null
  }
  static getDerivedStateFromError(cause: unknown): { error: string } {
    return { error: cause instanceof Error ? cause.message : 'Could not render this JSON' }
  }
  render() {
    return this.state.error
      ? <JsonSourceRecovery source={this.props.source} error={`The viewer could not render this document: ${this.state.error}`} onCommit={this.props.onCommit} />
      : this.props.children
  }
}
