import type { ReactNode } from 'react'

const PREVIEW_CSP = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'">`

function isolatedHtml(source: string): string {
  if (/<head\b[^>]*>/i.test(source)) return source.replace(/<head\b[^>]*>/i, (head) => `${head}${PREVIEW_CSP}`)
  if (/<html\b[^>]*>/i.test(source)) return source.replace(/<html\b[^>]*>/i, (html) => `${html}<head>${PREVIEW_CSP}</head>`)
  return `${PREVIEW_CSP}${source}`
}

export function HtmlPreview({ source, title }: { source: string; title: string }): ReactNode {
  return <iframe
    data-id="jsonView-html-preview"
    title={`${title} HTML preview`}
    sandbox=""
    referrerPolicy="no-referrer"
    srcDoc={isolatedHtml(source)}
    className="h-[min(65vh,720px)] min-h-80 w-full rounded-md border border-border bg-white"
  />
}
