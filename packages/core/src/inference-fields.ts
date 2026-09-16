export function normalizedKey(key: string): string {
  return key.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '')
}

/** A complete HTML document or a styled HTML fragment needs its own layout. */
export function isHtmlDocument(value: string): boolean {
  return /<!doctype\s+html\b/i.test(value)
    || /<html\b[^>]*>[\s\S]*<\/html\s*>/i.test(value)
    || (/<style\b[^>]*>[\s\S]*<\/style\s*>/i.test(value)
      && /<(?:body|div|main|section|article|table)\b/i.test(value))
}

/** Recognize common Markdown and supported HTML; keep bare hashtags and identifiers literal. */
export function isMarkdownText(value: string): boolean {
  return /(?:^|\n)#{1,6}\s+\S/.test(value)
    || /(?:^|\n)(?:```|~~~)[^\n]*\n[\s\S]+\n(?:```|~~~)/.test(value)
    || /(?:\*\*[^*\n]+\*\*|~~[^~\n]+~~|`[^`\n]+`)/.test(value)
    || /!?\[[^\]\n]*\]\([^\s)]+\)/.test(value)
    || /(?:^|\n)\s*(?:[-*+]|\d+[.)]|>)\s+\S/.test(value)
    || /(?:^|[\s(])(?:_[^_\n]+_|\*[^*\n]+\*)(?=$|[\s).,!?:;])/.test(value)
    || /(?:^|\n)[^\n]+\n(?:={3,}|-{3,})(?:\n|$)/.test(value)
    || /(?:^|\n)\s*\|?\s*:?-{3,}:?\s*\|/.test(value)
    || /<(?:br|hr|img)\b[^>]*\/?>/i.test(value)
    || /<(div|span|svg|pre|code|p|h[1-6]|strong|em|ul|ol|li|table|blockquote|a)\b[^>]*>[\s\S]*<\/\1>/i.test(value)
}
