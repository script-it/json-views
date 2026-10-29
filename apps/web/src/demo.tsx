import { StrictMode, useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '@script-it/json-views-react/styles.css'
import { JSONContent } from '@script-it/json-views-react'
import type { JsonDocumentSave } from '@script-it/json-views-core'
import './demo.css'

// The file starts with no data and one table view. The views live in the file
// itself, under "$jsonviews" below the data, exactly as in any JSON Views document.
const INITIAL = `{
  "tasks": [
  ],
  "$jsonviews": {
    "version": 1,
    "schema": {
      "$.tasks[*].status": { "type": "select", "optionColors": { "To do": "blue", "In progress": "purple", "Done": "green" } }
    },
    "views": [
      { "name": "Tasks", "path": "$.tasks" }
    ]
  }
}
`

const TASKS = [
  ['Define the launch checklist', 'In progress', 'Maya Chen'],
  ['Review onboarding copy', 'To do', 'Theo Martin'],
  ['Fix mobile navigation spacing', 'Done', 'Ari Patel'],
  ['Confirm analytics events', 'Done', 'Lena Ortiz'],
].map(([title, status, owner]) => `\n    {\n      "title": "${title}",\n      "status": "${status}",\n      "owner": "${owner}"\n    }`).join(',')

const BOARD_VIEW = `,
      {
        "name": "Board", "path": "$.tasks", "display": "kanban",
        "groupBy": "$.tasks[*].status", "groupOrder": ["To do", "In progress", "Done"]
      }`

const SUMMARY_HTML = '<h2>Launch tasks</h2><jv-repeat source="$.tasks" as="task"><div class="task"><b><jv-value bind="task.title"></jv-value></b><span><jv-value bind="task.status"></jv-value></span></div></jv-repeat>'
const SUMMARY_CSS = 'h2{margin:0 0 12px;font:600 20px system-ui}.task{display:flex;justify-content:space-between;gap:12px;margin:8px 0;padding:12px 14px;border-radius:12px;background:#f3f0ff;font:14px system-ui}.task span{color:#5b46b8;font-weight:600}'
const SUMMARY_VIEW = `,
      {
        "name": "Summary", "path": "$", "display": "html",
        "html": ${JSON.stringify(SUMMARY_HTML)},
        "css": ${JSON.stringify(SUMMARY_CSS)}
      }`

// What the agent writes, in order: the data, then a Kanban view, then an HTML view.
// Each edit inserts text after a unique anchor; `open` names the tab to show afterwards.
type Edit = { anchor: string; text: string; open?: string }
const EDITS: Edit[] = [
  { anchor: '"tasks": [', text: TASKS },
  { anchor: '{ "name": "Tasks", "path": "$.tasks" }', text: BOARD_VIEW, open: 'Board' },
  { anchor: '"groupOrder": ["To do", "In progress", "Done"]\n      }', text: SUMMARY_VIEW, open: 'Summary' },
]

// The finished file: every edit applied. A visitor who clicks starts from this.
const FINAL = EDITS.reduce((text, edit) => {
  const at = text.indexOf(edit.anchor) + edit.anchor.length
  return text.slice(0, at) + edit.text + text.slice(at)
}, INITIAL)

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
  // A new revision per change lets the viewer accept a return to earlier text (the loop's reset, an undo).
  const revision = useRef(0)
  const [viewerRevision, setViewerRevision] = useState('0')
  const [caret, setCaret] = useState<number | undefined>()
  const [mode, setMode] = useState<'playing' | 'editing'>('playing')
  const [theme] = useState(initialTheme)
  const playing = useRef(true)
  const codeRef = useRef<HTMLPreElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const viewRef = useRef<HTMLElement>(null)

  const show = useCallback((next: string, at?: number) => {
    setText(next)
    setCaret(at)
    if (!parses(next)) return
    revision.current += 1
    setViewerContent(next)
    setViewerRevision(String(revision.current))
  }, [])

  // The agent types into the JSON; the viewer follows every valid state, so each
  // object appears as soon as it is complete.
  useEffect(() => {
    let current = INITIAL
    let cancelled = false
    const active = () => playing.current && !cancelled
    const openTab = (name: string) => {
      const tab = [...(viewRef.current?.querySelectorAll('button') ?? [])].find((button) => button.textContent?.trim() === name)
      if (!tab) return
      // Press the tab like a pointer would; scripted events are not trusted, so they never hand over control.
      for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
        tab.dispatchEvent(new (type.startsWith('pointer') ? PointerEvent : MouseEvent)(type, { bubbles: true, cancelable: true, button: 0 }))
      }
      tab.click()
    }
    const run = async () => {
      await wait(1200)
      while (active()) {
        for (const edit of EDITS) {
          const start = current.indexOf(edit.anchor) + edit.anchor.length
          const head = current.slice(0, start)
          const tail = current.slice(start)
          const step = edit.text.length > 300 ? 4 : 2
          for (let length = step; length < edit.text.length + step && active(); length += step) {
            const typed = Math.min(length, edit.text.length)
            current = head + edit.text.slice(0, typed) + tail
            show(current, start + typed)
            await wait(16)
          }
          if (!active()) return
          show(current, undefined)
          await wait(edit.open ? 500 : 1200)
          if (edit.open) { openTab(edit.open); await wait(2600) }
        }
        await wait(1800)
        if (!active()) return
        current = INITIAL
        show(current, undefined)
        openTab('Tasks')
        await wait(1200)
      }
    }
    void run()
    return () => { cancelled = true }
  }, [show])

  // Any click or key press hands control to the visitor.
  useEffect(() => {
    const takeOver = (event: Event) => {
      if (!event.isTrusted || !playing.current) return
      playing.current = false
      // Hand over the finished file, wherever the animation was.
      revision.current += 1
      setText(FINAL)
      setViewerContent(FINAL)
      setViewerRevision(String(revision.current))
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
    revision.current += 1
    setText(next)
    setViewerContent(next)
    setViewerRevision(String(revision.current))
    return { content: next, revision: String(revision.current) }
  }, [])

  const before = caret === undefined ? text : text.slice(0, caret)
  const after = caret === undefined ? '' : text.slice(caret)
  const valid = parses(text)

  return (
    <main className="demo" data-theme={theme}>
      <section className="source">
        <header>
          <span className="file">tasks.json</span>
          {mode === 'playing'
            ? <span className="status playing">An agent is editing · click to try it</span>
            : !valid && <span className="status invalid">Invalid JSON: the view keeps the last valid version</span>}
        </header>
        {mode === 'playing'
          ? <pre ref={codeRef} aria-label="JSON source"><code dangerouslySetInnerHTML={{ __html: `${highlight(before)}${caret === undefined ? '' : '<span class="caret"></span>'}${highlight(after)}` }} /></pre>
          : <textarea ref={textareaRef} aria-label="JSON source" spellCheck={false} value={text} onChange={(event) => show(event.target.value)} autoFocus />}
      </section>
      <section className="view" ref={viewRef}>
        <JSONContent
          documentId="demo:tasks"
          path="tasks.json"
          content={viewerContent}
          revision={viewerRevision}
          theme={theme}
          fillHeight
          onSave={save}
        />
      </section>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><Demo /></StrictMode>)
