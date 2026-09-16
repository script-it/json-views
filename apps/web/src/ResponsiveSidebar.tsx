import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { PanelLeftClose, PanelLeftOpen, X } from 'lucide-react'

export function SidebarToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const label = open ? 'Hide left sidebar' : 'Show left sidebar'
  return <button className="icon-link sidebar-toggle" type="button" aria-controls="document-sidebar"
    aria-expanded={open} aria-label={label} title={label} onClick={onToggle}>
    {open ? <PanelLeftClose size={18} aria-hidden="true" /> : <PanelLeftOpen size={18} aria-hidden="true" />}
  </button>
}

/** One navigation subtree: a normal pane on desktop, a focus-trapped drawer on phones. */
export function ResponsiveSidebar({ children, mobile, open, onClose }: {
  children: ReactNode
  mobile: boolean
  open: boolean
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useLayoutEffect(() => {
    const element = dialog.current
    if (!element) return
    if (element.open) element.close()
    if (open) element.showModal()
  }, [mobile, open])
  if (!mobile) return <aside id="document-sidebar" className="document-sidebar" aria-label="Open structured data files" hidden={!open}>{children}</aside>
  return <dialog
    ref={dialog}
    id="document-sidebar"
    className="document-sidebar"
    aria-label="Open structured data files"
    onCancel={(event) => { event.preventDefault(); onClose() }}
    onClick={(event) => {
      if (!mobile || event.target !== event.currentTarget) return
      const bounds = event.currentTarget.getBoundingClientRect()
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose()
    }}
  >
    {mobile && <header className="sidebar-mobile-heading"><strong>Your files</strong><button type="button" className="icon-link" aria-label="Close files" onClick={onClose}><X size={20} /></button></header>}
    {children}
  </dialog>
}
