export interface FileContentData {
  source: { base64: string }
  mimeType?: string | null
}

export function fileDataToText(data: FileContentData): string {
  const binary = atob(data.source.base64)
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}
