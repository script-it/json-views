import { useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { JsonDocumentSession } from '@script-it/json-views-core'
import {
  createDefaultWidgetRegistry,
  JSONContent,
  JsonViewsProvider,
  type JsonViewDisplayWidgetProps,
  type JsonViewEditWidgetProps,
} from '@script-it/json-views-react'
import { createEmbeddingTypeRegistry, documentSource, isCoordinate } from './embedding-data.mjs'
import './host.css'
import '@script-it/json-views-react/styles.css'

const types = createEmbeddingTypeRegistry()

function CoordinateDisplay({ value }: JsonViewDisplayWidgetProps) {
  return <span className="fixture-coordinate-display" data-testid="coordinate-display">⌖ {isCoordinate(value) ? `${value.x} / ${value.y}` : 'Invalid coordinates'}</span>
}

function CoordinateEditor(props: JsonViewEditWidgetProps) {
  return <div className="fixture-coordinate-editor">
    <input
      className="fixture-coordinate-input"
      aria-label={`Edit ${props.label} coordinates`}
      aria-invalid={Boolean(props.error)}
      value={props.stringValue}
      disabled={props.disabled}
      placeholder="12.5, 48.2"
      onChange={(event) => props.onChange(event.target.value)}
    />
    <button className="fixture-widget-button" type="button" disabled={props.disabled} onClick={() => props.onCommit()}>Save coordinates</button>
    <button className="fixture-widget-button" type="button" onClick={props.onCancel}>Cancel</button>
  </div>
}

const widgets = createDefaultWidgetRegistry().register('coordinate', { display: CoordinateDisplay, editor: CoordinateEditor })


const initialSources = { light: documentSource('light'), dark: documentSource('dark') }
const sessions = {
  light: new JsonDocumentSession({ id: 'consumer-light', content: initialSources.light, revision: 'light-0' }),
  dark: new JsonDocumentSession({ id: 'consumer-dark', content: initialSources.dark, revision: 'dark-0' }),
}
const acceptedRevisions = { light: 0, dark: 0 }

function EmbeddedDocument({ theme }: { theme: 'light' | 'dark' }) {
  const session = sessions[theme]
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot)
  const [editingEnabled, setEditingEnabled] = useState(true)
  const commit = (content: string) => session.commit(() => content, async (accepted) => ({
    content: accepted,
    revision: `${theme}-${++acceptedRevisions[theme]}`,
  }))

  return <section className="fixture-card" data-testid={`${theme}-document`}>
    <header className="fixture-card-header">
      <div><h2>{theme === 'light' ? 'Light viewer' : 'Dark viewer'}</h2><p>Session: {snapshot.documentId} · Revision: {snapshot.revision}</p></div>
      <label className="fixture-edit-toggle"><input type="checkbox" checked={editingEnabled} onChange={(event) => setEditingEnabled(event.target.checked)} /> Editing enabled</label>
    </header>
    <div className="fixture-viewer-frame">
      <JSONContent
        documentId={snapshot.documentId}
        revision={snapshot.revision}
        content={snapshot.content}
        theme={theme}
        onSave={editingEnabled ? commit : undefined}
      />
    </div>
    <details className="fixture-source" open>
      <summary>Inspect {theme} document source</summary>
      <pre aria-label={`${theme} document source`}>{snapshot.content}</pre>
    </details>
    {snapshot.error && <p role="alert">{snapshot.error.message}</p>}
  </section>
}

function Consumer() {
  const [hostClicks, setHostClicks] = useState(0)
  return <main className="fixture-page">
    <header className="fixture-intro">
      <p className="fixture-eyebrow">JSON Views · installed package integration</p>
      <h1>Two themes. Two documents. One host.</h1>
      <p>The panels use the packed library, independent document sessions, and a custom object-valued coordinate widget. Click Status or Follow up to inspect a themed popup. Click Location to edit the custom widget.</p>
    </header>
    <aside className="fixture-host-panel" aria-label="Unrelated host application">
      <h2 className="text-foreground">Unrelated host interface</h2>
      <p className="text-muted-foreground">This host owns its global tokens, utility classes, button borders, and typography. Its appearance should stay unchanged while either viewer opens a portal or edits a value.</p>
      <button className="bg-primary text-primary-foreground rounded-md px-4 py-2" type="button" data-testid="host-button" onClick={() => setHostClicks((count) => count + 1)}>Host button · {hostClicks}</button>
      <span className="fixture-host-badge bg-background text-foreground border-border">Host colors remain purple and cream</span>
    </aside>
    <JsonViewsProvider types={types} widgets={widgets}>
      <div className="fixture-viewers"><EmbeddedDocument theme="light" /><EmbeddedDocument theme="dark" /></div>
    </JsonViewsProvider>
  </main>
}

createRoot(document.getElementById('root')!).render(<Consumer />)
