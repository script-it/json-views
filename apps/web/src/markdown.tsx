import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import { Check, Copy } from 'lucide-react'
import Markdown, { defaultUrlTransform, type Components } from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import { copyText } from './clipboard.js'

function headingSlug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function findHeading(from: Element, target: string): Element | undefined {
  return [...(from.closest('.json-views-markdown')?.querySelectorAll('h1, h2, h3, h4') ?? [])]
    .find((candidate) => headingSlug(candidate.textContent ?? '').includes(target))
}

/** Copies the text carried by a `#copy:<url-encoded text>` link. */
function MarkdownCopyLink({ href, className, children }: { href: string; className?: string; children?: ReactNode }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1800)
    return () => clearTimeout(timer)
  }, [copied])
  return (
    <a href="#" className={className} aria-live="polite" {...keepClickInside} onClick={async (event) => {
      event.preventDefault()
      event.stopPropagation()
      let text = ''
      try { text = decodeURIComponent(href.slice('#copy:'.length)) } catch { return }
      if (!text) return
      try { await copyText(text); setCopied(true) } catch { /* Clipboard access was denied; the label stays unchanged. */ }
    }}>
      {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
      {copied ? 'Copied' : children}
    </a>
  )
}

// Clicks inside an editable Markdown value must not open its editor.
const stopPropagation = (event: { stopPropagation(): void }) => event.stopPropagation()
const keepClickInside = { onMouseDown: stopPropagation, onPointerDown: stopPropagation }

function MarkdownCodeBlock({ children }: { children?: ReactNode }) {
  const block = useRef<HTMLPreElement>(null)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1800)
    return () => clearTimeout(timer)
  }, [copied])
  return (
    <div className="markdown-code-block">
      <button className="button secondary markdown-copy" type="button" aria-live="polite" {...keepClickInside} onClick={async (event) => {
        event.stopPropagation()
        try { await copyText(block.current?.textContent ?? ''); setCopied(true) } catch { /* The text remains selectable. */ }
      }}>
        {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre ref={block}>{children}</pre>
    </div>
  )
}

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(() => typeof matchMedia === 'function' && matchMedia(REDUCED_MOTION).matches)
  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const query = matchMedia(REDUCED_MOTION)
    const update = () => setReduce(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return reduce
}

// Images below the fold load as the reader scrolls toward them. An image named
// `*-light.<ext>` also renders its `*-dark.<ext>` twin; the site theme shows one.
// The site's animated WebPs show their `*.still.webp` frame to readers who prefer reduced motion.
function MarkdownImage(props: ComponentProps<'img'>) {
  const reduceMotion = usePrefersReducedMotion()
  const source = (src: string) => reduceMotion ? stillSource(src) ?? src : src
  if (typeof props.src !== 'string') return <img {...props} loading="lazy" decoding="async" />
  const darkSource = themedDarkSource(props.src)
  if (!darkSource) return <img {...props} src={source(props.src)} loading="lazy" decoding="async" />
  return <>
    <img {...props} src={source(props.src)} className="theme-light" loading="lazy" decoding="async" />
    <img {...props} src={source(darkSource)} className="theme-dark" loading="lazy" decoding="async" />
  </>
}

const MARKDOWN_COMPONENTS: Components = {
  a: ({ node: _node, title, ...props }) => {
    const href = props.href ?? ''
    // A link titled "button" or "button primary" renders as a button.
    const button = title === 'button' || title === 'button primary'
    const className = button ? `button ${title === 'button primary' ? 'primary' : 'secondary'} markdown-button` : undefined
    const titleProps = button || title === undefined ? {} : { title }
    if (href.startsWith('#/') || isAgentLink(href)) return <a {...props} {...titleProps} className={className} />
    if (href.startsWith('#copy:')) return <MarkdownCopyLink href={href} className={className}>{props.children}</MarkdownCopyLink>
    if (href.startsWith('#')) {
      // An in-page link scrolls to the heading whose text matches it.
      return <a {...props} {...titleProps} className={className} onClick={(event) => {
        const heading = findHeading(event.currentTarget, href.slice(1))
        if (!heading) return
        event.preventDefault()
        event.stopPropagation()
        heading.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }} />
    }
    return <a {...props} {...titleProps} className={className} target="_blank" rel="noreferrer" />
  },
  // Only the site's own live demo may be embedded; any other frame is dropped.
  iframe: ({ node: _node, src, title }) => isDemoFrame(src)
    ? <iframe className="markdown-demo" src={src} title={title ?? 'JSON Views live demo'} loading="lazy" />
    : null,
  img: ({ node: _node, ...props }) => <MarkdownImage {...props} />,
  pre: ({ node: _node, children }) => <MarkdownCodeBlock>{children}</MarkdownCodeBlock>,
}

// Deep links that open a coding agent with a setup prompt.
const AGENT_LINK_PROTOCOLS = ['claude', 'codex', 'cursor', 'grokbot']
const isAgentLink = (href: string) => AGENT_LINK_PROTOCOLS.some((protocol) => href.startsWith(`${protocol}:`))
const themedDarkSource = (src: string) => /-light\.(?:jpe?g|png|webp|gif)$/.test(src) ? src.replace(/-light(\.\w+)$/, '-dark$1') : undefined
/** The still frame shipped next to the site's own animated WebPs, e.g. `./home/x-light.webp` → `./home/x-light.still.webp`. */
export const stillSource = (src: string) => /^\.\/home\/[\w-]+\.webp$/.test(src) ? src.replace(/\.webp$/, '.still.webp') : undefined
const isDemoFrame = (src: unknown) => typeof src === 'string' && /^\.\/demo\.html(?:\?[\w=&-]*)?$/.test(src)
const markdownUrlTransform = (url: string) => isAgentLink(url) ? url : defaultUrlTransform(url)

const HTML_SANITIZE_SCHEMA = {
  ...defaultSchema,
  protocols: { ...defaultSchema.protocols, href: [...(defaultSchema.protocols?.href ?? []), ...AGENT_LINK_PROTOCOLS] },
  tagNames: [...(defaultSchema.tagNames ?? []), 'svg', 'circle', 'text', 'iframe'],
  attributes: {
    ...defaultSchema.attributes,
    iframe: ['src', 'title'],
    svg: ['ariaLabel', 'height', 'role', 'viewBox', 'width'],
    circle: ['cx', 'cy', 'fill', 'r', 'stroke', 'strokeLinecap', 'strokeWidth'],
    text: ['dominantBaseline', 'fill', 'fontFamily', 'fontSize', 'fontWeight', 'textAnchor', 'x', 'y'],
  },
}

export function renderMarkdownBody(content: string): ReactNode {
  return (
    <div className="json-views-markdown">
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, HTML_SANITIZE_SCHEMA]]}
        components={MARKDOWN_COMPONENTS}
        urlTransform={markdownUrlTransform}
      >
        {content}
      </Markdown>
    </div>
  )
}
