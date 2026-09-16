export async function copyTextToClipboard(value: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value)
      return
    } catch { /* Fall back when the browser exposes but denies the Clipboard API. */ }
  }

  if (typeof document === 'undefined') throw new Error('Clipboard access is unavailable')
  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  try {
    if (!document.execCommand('copy')) throw new Error('Clipboard access was denied')
  } finally {
    textarea.remove()
  }
}
