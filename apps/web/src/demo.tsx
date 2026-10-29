import { StrictMode, useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '@script-it/json-views-react/styles.css'
import { JSONContent } from '@script-it/json-views-react'
import type { JsonDocumentSave } from '@script-it/json-views-core'
import './demo.css'

// The site's own articles, as published in "About JSON Views". The file starts
// with no data and one table view; the views live in the file itself, under
// "$jsonviews" below the data, exactly as in any JSON Views document.
const INITIAL = `{
  "articles": [
  ],
  "$jsonviews": {
    "version": 1,
    "schema": {
      "$.articles[*].topic": { "type": "select", "optionColors": { "Overview": "blue", "Origin": "orange", "Files": "green", "Format": "yellow", "Getting started": "gray", "Privacy": "purple" } },
      "$.articles[*].audience": { "type": "multi-select", "optionColors": { "Everyone": "blue", "Developers": "purple", "Agents": "green" } },
      "$.articles[*].done": { "type": "checkbox" }
    },
    "views": [
      { "name": "Articles", "path": "$.articles" }
    ]
  }
}
`

const ARTICLES = ([
  ['What is this?', 'Overview', ['Everyone', 'Notion Lovers'], 223],
  ['Why we built this?', 'Origin', ['Everyone', 'Script.it Fans'], 30],
  ['How the Editor Works', 'Files', ['Everyone'], 57],
  ['The file schema', 'Format', ['Developers', 'Agents'], 31],
  ['Multiple ways to use json-views', 'Getting started', ['Everyone'], 44],
  ['A very private web app', 'Privacy', ['Everyone'], 24],
  ['Embed json-views in your app', 'Getting started', ['Developers'], 27],
] as const).map(([title, topic, audience, readingTime]) => `\n    {\n      "title": "${title}",\n      "topic": "${topic}",\n      "audience": ${JSON.stringify(audience).replace(/","/g, '", "')},\n      "reading_time": ${readingTime},\n      "done": false\n    }`).join(',')

const BOARD_VIEW = `,
      {
        "name": "Board", "path": "$.articles", "display": "kanban",
        "groupBy": "$.articles[*].topic",
        "groupOrder": ["Overview", "Origin", "Files", "Format", "Getting started", "Privacy"]
      }`

const READING_HTML = '<div class="guide"><p class="eyebrow">📚 JSON Views guide</p><h2>Reading list</h2><p class="lede">Seven short articles about JSON Views.</p><jv-repeat source="$.articles" as="article"><div class="row" jv-attr-aria-label="article.done"><input type="checkbox" jv-bind="article.done" aria-label="Read"><div class="body"><input class="title" jv-bind="article.title" aria-label="Title"><small><jv-value bind="article.reading_time"></jv-value> sec read</small></div><span class="pill"><jv-field bind="article.topic" aria-label="Topic"></jv-field></span></div></jv-repeat></div>'
const READING_CSS = '.guide{padding:22px 24px;border-radius:18px;background:linear-gradient(135deg,#1d1a33,#3b2a7a);color:#fff;font:14px/1.4 system-ui}.eyebrow{margin:0;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#c9bcff}h2{margin:6px 0 2px;font:700 24px/1.2 system-ui;letter-spacing:-.01em}.lede{margin:0 0 16px;color:#cfc7f2}.row{display:flex;align-items:center;gap:12px;margin:8px 0;padding:10px 14px;border-radius:12px;background:rgba(255,255,255,.08)}input[type=checkbox]{flex:none;width:18px;height:18px;margin:0;accent-color:#5fd39a}.body{display:grid;flex:1;min-width:0}.title{width:100%;margin:0;padding:1px 4px;border:1px solid transparent;border-radius:6px;color:inherit;background:transparent;font:inherit;font-weight:700}.title:hover{border-color:rgba(255,255,255,.18)}.title:focus{outline:0;border-color:#b69cff;background:rgba(255,255,255,.08)}small{padding:0 4px;color:#b9afe2;font-size:12.5px}.pill{padding:3px 10px;border-radius:999px;background:rgba(255,255,255,.12);color:#ddd2ff;font-size:12px;font-weight:600;white-space:nowrap}.row[aria-label="true"] .title{text-decoration:line-through;opacity:.6}'
const READING_VIEW = `,
      {
        "name": "Reading list", "path": "$", "display": "html",
        "html": ${JSON.stringify(READING_HTML)},
        "css": ${JSON.stringify(READING_CSS)}
      }`

// What the agent writes, in order: the data, then a Kanban view, then an HTML view.
// Each edit inserts text after a unique anchor, `step` characters per frame; `open` names the tab to show afterwards.
type Edit = { anchor: string; text: string; step: number; open?: string }
const EDITS: Edit[] = [
  { anchor: '"articles": [', text: ARTICLES, step: 6 },
  { anchor: '{ "name": "Articles", "path": "$.articles" }', text: BOARD_VIEW, step: 2, open: 'Board' },
  { anchor: '"groupOrder": ["Overview", "Origin", "Files", "Format", "Getting started", "Privacy"]\n      }', text: READING_VIEW, step: 16, open: 'Reading list' },
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
  const [theme, setTheme] = useState(initialTheme)
  // Follow the site's theme toggle (shared storage) and the system setting.
  useEffect(() => {
    const update = () => setTheme(initialTheme())
    const system = matchMedia('(prefers-color-scheme: dark)')
    window.addEventListener('storage', update)
    system.addEventListener('change', update)
    return () => { window.removeEventListener('storage', update); system.removeEventListener('change', update) }
  }, [])
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
          // Stop at every point where the JSON is complete again, so each object lands in the view.
          const stops = new Set<number>()
          for (let length = 1; length <= edit.text.length; length++) if (parses(head + edit.text.slice(0, length) + tail)) stops.add(length)
          let typed = 0
          while (typed < edit.text.length && active()) {
            let next = Math.min(typed + edit.step, edit.text.length)
            for (let length = typed + 1; length < next; length++) if (stops.has(length)) { next = length; break }
            typed = next
            current = head + edit.text.slice(0, typed) + tail
            show(current, start + typed)
            await wait(stops.has(typed) && typed < edit.text.length ? 260 : 16)
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
        openTab('Articles')
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

  // Keep the typing in view by scrolling the code panel only, never the page around
  // the demo, and leave the panel alone for a moment after the visitor scrolls it.
  const lastManualScroll = useRef(0)
  useEffect(() => {
    if (mode !== 'playing' || caret === undefined) return
    const code = codeRef.current
    const marker = code?.querySelector<HTMLElement>('.caret')
    if (!code || !marker || Date.now() - lastManualScroll.current < 3000) return
    const top = marker.offsetTop
    const margin = 48
    if (top < code.scrollTop + margin) code.scrollTop = Math.max(0, top - margin)
    else if (top > code.scrollTop + code.clientHeight - margin) code.scrollTop = top - code.clientHeight + margin
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
          <span className="file">articles.json</span>
          {mode === 'playing'
            ? <span className="status playing">An agent is editing · click to try it</span>
            : !valid && <span className="status invalid">Invalid JSON: the view keeps the last valid version</span>}
        </header>
        {mode === 'playing'
          ? <pre ref={codeRef} aria-label="JSON source" onWheel={() => { lastManualScroll.current = Date.now() }} onTouchMove={() => { lastManualScroll.current = Date.now() }}><code dangerouslySetInnerHTML={{ __html: `${highlight(before)}${caret === undefined ? '' : '<span class="caret"></span>'}${highlight(after)}` }} /></pre>
          : <textarea ref={textareaRef} aria-label="JSON source" spellCheck={false} value={text} onChange={(event) => show(event.target.value)} autoFocus />}
      </section>
      <section className="view" ref={viewRef}>
        <JSONContent
          documentId="demo:articles"
          path="articles.json"
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
