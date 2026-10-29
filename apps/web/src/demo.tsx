import { StrictMode, useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '@script-it/json-views-react/styles.css'
import { JSONContent } from '@script-it/json-views-react'
import type { JsonDocumentSave } from '@script-it/json-views-core'
import './demo.css'

// Views are supplied separately, so the JSON on the left stays plain data.
const METADATA = {
  version: 1,
  schema: {
    '$.tasks[*].title': { type: 'text', title: 'Task' },
    '$.tasks[*].status': {
      type: 'select',
      title: 'Status',
      options: ['To do', 'In progress', 'Done'],
      optionColors: { 'To do': 'blue', 'In progress': 'purple', Done: 'green' },
    },
    '$.tasks[*].owner': { type: 'text', title: 'Owner' },
    '$.tasks[*].due': { type: 'date', title: 'Due' },
  },
  views: [
    {
      id: 'board',
      name: 'Board',
      path: '$.tasks',
      display: 'kanban',
      groupBy: '$.tasks[*].status',
      groupOrder: ['To do', 'In progress', 'Done'],
      columns: [
        { label: 'Task', path: '$.tasks[*].title' },
        { label: 'Owner', path: '$.tasks[*].owner' },
        { label: 'Due', path: '$.tasks[*].due' },
      ],
    },
    {
      id: 'table',
      name: 'Table',
      path: '$.tasks',
      columns: [
        { label: 'Task', path: '$.tasks[*].title' },
        { label: 'Status', path: '$.tasks[*].status' },
        { label: 'Owner', path: '$.tasks[*].owner' },
        { label: 'Due', path: '$.tasks[*].due' },
      ],
    },
  ],
}

const INITIAL = `${JSON.stringify({
  tasks: [
    { title: 'Define the launch checklist', status: 'In progress', owner: 'Maya Chen', due: '2026-09-10' },
    { title: 'Review onboarding copy', status: 'To do', owner: 'Theo Martin', due: '2026-09-12' },
    { title: 'Fix mobile navigation spacing', status: 'To do', owner: 'Ari Patel', due: '2026-09-09' },
    { title: 'Confirm analytics events', status: 'Done', owner: 'Maya Chen', due: '2026-09-06' },
  ],
}, null, 2)}\n`

const NEW_TASK = `,
    {
      "title": "Write the release notes",
      "status": "To do",
      "owner": "Lena Ortiz",
      "due": "2026-09-15"
    }`

// What the agent does, in order. Each edit replaces text after a unique anchor.
type Edit = { anchor: string; from: string; to: string }
const EDITS: Edit[] = [
  { anchor: '"title": "Fix mobile navigation spacing",\n      "status": "', from: 'To do', to: 'Done' },
  { anchor: '"title": "Review onboarding copy",\n      "status": "', from: 'To do', to: 'In progress' },
  { anchor: '"due": "2026-09-06"\n    }', from: '', to: NEW_TASK },
]

function parses(text: string): boolean {
  try { JSON.parse(text); return true } catch { return false }
}

function initialTheme(): 'light' | 'dark' {
  try {
    const stored = localStorage.getItem('json-views-theme')
    if (stored === 'light' || stored === 'dark') return stored
  } catch { /* Fall back to the system preference. */ }
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function highlight(text: string): string {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  return escaped.replace(/("(?:[^"\\]|\\.)*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?)/g, (match, string, colon, keyword) => {
    if (string) return colon ? `<span class="key">${string}</span>${colon}` : `<span class="string">${string}</span>`
    return `<span class="${keyword ? 'keyword' : 'number'}">${match}</span>`
  })
}

function Demo() {
  const [text, setText] = useState(INITIAL)
  const [viewerContent, setViewerContent] = useState(INITIAL)
  const [caret, setCaret] = useState<number | undefined>()
  const [mode, setMode] = useState<'playing' | 'editing'>('playing')
  const [theme] = useState(initialTheme)
  // View settings changed in the board (lane order, columns) stay for this visit.
  const [metadata, setMetadata] = useState<Record<string, unknown>>(METADATA)
  const playing = useRef(true)
  const codeRef = useRef<HTMLPreElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const show = useCallback((next: string, at?: number) => {
    setText(next)
    setCaret(at)
    if (parses(next)) setViewerContent(next)
  }, [])

  // The agent types its edits into the JSON; the viewer follows every valid state.
  useEffect(() => {
    let current = INITIAL
    let cancelled = false
    const active = () => playing.current && !cancelled
    const run = async () => {
      await wait(1400)
      while (active()) {
        for (const edit of EDITS) {
          const start = current.indexOf(edit.anchor) + edit.anchor.length
          const head = current.slice(0, start)
          const tail = current.slice(start + edit.from.length)
          for (let length = edit.from.length - 1; length >= 0 && active(); length--) {
            current = head + edit.from.slice(0, length) + tail
            show(current, start + length)
            await wait(45)
          }
          const typingDelay = edit.to.length > 40 ? 14 : 70
          for (let length = 1; length <= edit.to.length && active(); length++) {
            current = head + edit.to.slice(0, length) + tail
            show(current, start + length)
            await wait(typingDelay)
          }
          if (!active()) return
          show(current, undefined)
          await wait(1800)
        }
        await wait(2200)
        if (!active()) return
        current = INITIAL
        show(current, undefined)
        await wait(1600)
      }
    }
    void run()
    return () => { cancelled = true }
  }, [show])

  // Any click or key press hands control to the visitor.
  useEffect(() => {
    const takeOver = () => {
      if (!playing.current) return
      playing.current = false
      setCaret(undefined)
      setMode('editing')
    }
    window.addEventListener('pointerdown', takeOver, { capture: true })
    window.addEventListener('keydown', takeOver, { capture: true })
    return () => {
      window.removeEventListener('pointerdown', takeOver, { capture: true })
      window.removeEventListener('keydown', takeOver, { capture: true })
    }
  }, [])

  useEffect(() => {
    if (mode !== 'playing' || caret === undefined) return
    codeRef.current?.querySelector('.caret')?.scrollIntoView({ block: 'nearest' })
  }, [caret, mode, text])

  // Edits made in the view write back to the JSON on the left.
  const save: JsonDocumentSave = useCallback(async (next) => {
    setText(next)
    setViewerContent(next)
    return { content: next }
  }, [])

  const before = caret === undefined ? text : text.slice(0, caret)
  const after = caret === undefined ? '' : text.slice(caret)
  const valid = parses(text)

  return (
    <main className="demo" data-theme={theme}>
      <section className="source">
        <header>
          <span className="file">tasks.json</span>
          <span className={`status ${mode}`}>{mode === 'playing' ? 'An agent is editing · click to try it' : valid ? 'Your turn: edit the JSON or the board' : 'Invalid JSON: the view keeps the last valid version'}</span>
        </header>
        {mode === 'playing'
          ? <pre ref={codeRef} aria-label="JSON source"><code dangerouslySetInnerHTML={{ __html: `${highlight(before)}${caret === undefined ? '' : '<span class="caret"></span>'}${highlight(after)}` }} /></pre>
          : <textarea ref={textareaRef} aria-label="JSON source" spellCheck={false} value={text} onChange={(event) => show(event.target.value)} autoFocus />}
      </section>
      <section className="view">
        <JSONContent
          documentId="demo:tasks"
          path="tasks.json"
          content={viewerContent}
          metadata={metadata}
          onMetadataChange={async (next) => setMetadata(next)}
          theme={theme}
          fillHeight
          presentationState={{ version: 1, activeView: 'view:board' }}
          onSave={save}
        />
      </section>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><Demo /></StrictMode>)
