import { useId, useRef, useState, type ReactNode } from 'react'
import { BookOpen, Check, Copy, X } from 'lucide-react'
import prompt from '../public/agent-prompt.md?raw'

const description = prompt.trim().replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replaceAll('`', '')

interface AgentGuideProps {
  copyText: (text: string) => Promise<void>
  renderMarkdown: (text: string) => ReactNode
}

export function AgentGuide({ copyText, renderMarkdown }: AgentGuideProps) {
  const id = useId()
  const dialog = useRef<HTMLDialogElement>(null)
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState('')

  const copyPrompt = async () => {
    setCopied(false)
    setCopyError('')
    try {
      await copyText(prompt.trim())
      setCopied(true)
    } catch {
      setCopyError('Could not copy the prompt. You can select and copy the guide text directly.')
    }
  }

  return <>
    <a
      className="button secondary agent-guide-trigger"
      href="./agent-prompt.md"
      aria-label={`Agent Guide. ${description}`}
      aria-haspopup="dialog"
      aria-controls={id}
      onClick={(event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
          || typeof dialog.current?.showModal !== 'function') return
        event.preventDefault()
        dialog.current.showModal()
      }}
    >
      <BookOpen size={15} aria-hidden="true" /> Agent Guide
    </a>
    <dialog
      ref={dialog}
      id={id}
      className="agent-guide-dialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      onClose={() => { setCopied(false); setCopyError('') }}
    >
      <div className="agent-guide-heading">
        <h2 id={`${id}-title`}>Agent Guide</h2>
        <button className="icon-link" type="button" aria-label="Close Agent Guide" onClick={() => dialog.current?.close()}>
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <div id={`${id}-description`}>{renderMarkdown(prompt)}</div>
      {copyError && <p role="alert" className="agent-guide-error">{copyError}</p>}
      <div className="agent-guide-actions">
        <button className="button primary" type="button" aria-live="polite" onClick={() => { void copyPrompt() }}>
          {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
          {copied ? 'Copied prompt' : 'Copy prompt'}
        </button>
      </div>
    </dialog>
  </>
}
