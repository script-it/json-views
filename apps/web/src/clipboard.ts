/** Copies text, falling back to a hidden textarea where the Clipboard API is unavailable or denied. */
export async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value)
      return
    } catch { /* Fall back for browsers that expose the API but deny access. */ }
  }
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
