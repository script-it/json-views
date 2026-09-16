export interface JsonDocumentSource {
  content: string
  revision?: string
}

export interface JsonDocumentSnapshot extends JsonDocumentSource {
  documentId: string
  acknowledgedContent: string
  dirty: boolean
  saving: boolean
  error?: Error
}

export interface JsonDocumentCommitContext {
  documentId: string
  baseContent: string
  baseRevision?: string
}

export type JsonDocumentSave = (
  content: string,
  context: JsonDocumentCommitContext,
) => Promise<void | JsonDocumentSource>

export type DocumentContentValidator = (content: string) => void

export class JsonDocumentConflictError extends Error {
  constructor() {
    super('The document changed outside this editor. Your draft is preserved; reload the saved document before retrying.')
    this.name = 'JsonDocumentConflictError'
  }
}

/** One document's draft, acknowledged source and in-flight persistence operation. */
export class JsonDocumentSession {
  private snapshot: JsonDocumentSnapshot
  private observed: JsonDocumentSource
  private readonly listeners = new Set<() => void>()
  private readonly acknowledgements: JsonDocumentSource[] = []
  private generation = 0
  private pending: { content: string; generation: number; conflicted: boolean; observed?: JsonDocumentSource } | undefined
  private conflicted = false
  private readonly validateContent: DocumentContentValidator

  constructor(source: JsonDocumentSource & { id: string; validateContent?: DocumentContentValidator }) {
    this.validateContent = source.validateContent ?? (() => undefined)
    this.observed = { content: source.content, revision: source.revision }
    this.snapshot = {
      documentId: source.id,
      content: source.content,
      acknowledgedContent: source.content,
      revision: source.revision,
      dirty: false,
      saving: false,
    }
    this.remember(source)
  }

  readonly getSnapshot = (): JsonDocumentSnapshot => this.snapshot

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private publish(next: Partial<JsonDocumentSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...next }
    this.snapshot.dirty = this.snapshot.content !== this.snapshot.acknowledgedContent
    this.listeners.forEach((listener) => listener())
  }

  private remember(source: JsonDocumentSource): void {
    const existing = this.acknowledgements.findIndex((entry) => (
      entry.content === source.content && entry.revision === source.revision
    ))
    if (existing >= 0) this.acknowledgements.splice(existing, 1)
    this.acknowledgements.push({ content: source.content, revision: source.revision })
    // Retain recent accepted identities to recognize delayed host echoes.
    if (this.acknowledgements.length > 32) this.acknowledgements.shift()
  }

  private isAcknowledgedEcho(source: JsonDocumentSource): boolean {
    return this.acknowledgements.some((entry) => entry.content === source.content
      && (source.revision === undefined || entry.revision === source.revision))
  }

  /** Receive a persisted host snapshot. Authoritative reloads can intentionally restore
   * a historical identity; opaque revisions alone cannot distinguish that from an echo.
   */
  receive(source: JsonDocumentSource, options: { authoritative?: boolean } = {}): void {
    if (!options.authoritative && source.content === this.observed.content && source.revision === this.observed.revision) return
    if (!options.authoritative && this.isAcknowledgedEcho(source)) {
      this.observed = { ...source }
      return
    }
    if (source.content === this.pending?.content) {
      // Matching in-flight observations remain provisional until persistence resolves.
      this.pending.observed = {
        content: source.content,
        revision: source.revision ?? (this.pending.observed?.content === source.content ? this.pending.observed.revision : undefined),
      }
      return
    }
    this.observed = { ...source }
    if (source.content === this.snapshot.acknowledgedContent && !this.pending) {
      if (source.revision !== undefined) this.publish({ revision: source.revision })
      this.remember({ content: source.content, revision: this.snapshot.revision })
      return
    }

    const preserveDraft = (this.snapshot.dirty && source.content !== this.snapshot.content) || this.pending !== undefined
    this.conflicted = preserveDraft
    if (this.pending) {
      this.pending.conflicted = true
      this.pending.observed = { ...source }
    }
    this.remember(source)
    this.publish({
      acknowledgedContent: source.content,
      revision: source.revision,
      content: preserveDraft ? this.snapshot.content : source.content,
      error: preserveDraft ? new JsonDocumentConflictError() : undefined,
    })
  }

  /** Source is stored exactly; format-aware clients can report validity separately. */
  edit(content: string): void {
    if (content === this.snapshot.content) return
    this.generation += 1
    this.publish({ content, error: this.conflicted ? this.snapshot.error : undefined })
  }

  /** Discard the current draft and restore the latest acknowledged host source. */
  reset(): void {
    if (this.pending) throw new Error('Wait for the current save before reloading the document')
    this.generation += 1
    this.conflicted = false
    this.publish({ content: this.snapshot.acknowledgedContent, error: undefined })
  }

  async commit(buildNext: (source: string) => string, save: JsonDocumentSave): Promise<void> {
    if (this.pending) throw new Error('A save is already in progress')
    if (this.conflicted) throw new JsonDocumentConflictError()
    let content: string
    try {
      content = buildNext(this.snapshot.content)
      this.validateContent(content)
    } catch (error) {
      this.publish({ error: error instanceof Error ? error : new Error(String(error)) })
      throw error
    }
    if (content === this.snapshot.acknowledgedContent) {
      this.edit(content)
      this.publish({ error: undefined })
      return
    }
    const context: JsonDocumentCommitContext = {
      documentId: this.snapshot.documentId,
      baseContent: this.snapshot.acknowledgedContent,
      baseRevision: this.snapshot.revision,
    }
    if (content !== this.snapshot.content) this.generation += 1
    const pending: NonNullable<JsonDocumentSession['pending']> = { content, generation: this.generation, conflicted: false }
    this.pending = pending
    this.publish({ content, saving: true, error: undefined })
    try {
      const result = await save(content, context)
      const response = result ?? { content, revision: this.snapshot.revision }
      if (pending.conflicted && pending.observed?.content !== response.content) throw new JsonDocumentConflictError()
      // A matching host observation during the request is newer evidence than its response.
      // Revisions are opaque: only an identical accepted content can inherit that revision.
      const accepted = pending.observed?.content === response.content && pending.observed.revision !== undefined
        ? { content: response.content, revision: pending.observed.revision } : response
      this.remember(response)
      this.remember(accepted)
      this.conflicted = false
      this.publish({
        error: undefined,
        acknowledgedContent: accepted.content,
        revision: accepted.revision,
        content: this.generation === pending.generation ? accepted.content : this.snapshot.content,
      })
    } catch (error) {
      this.publish({ error: error instanceof Error ? error : new Error(String(error)) })
      throw error
    } finally {
      this.pending = undefined
      this.publish({ saving: false })
    }
  }
}
