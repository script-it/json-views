import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { inspectJsonSource, ValuePath } from '@script-it/json-views-core'

type SourceDiagnostic = ReturnType<typeof inspectJsonSource>['diagnostics'][number]
type LiteralLookup = (path?: ValuePath | null) => string | undefined
interface SourceLiterals {
  lookup: LiteralLookup
  containsRisk: (path?: ValuePath) => boolean
}
const SourceLiteralsContext = createContext<SourceLiterals>({ lookup: () => undefined, containsRisk: () => false })

/** The original number token stays authoritative when JavaScript cannot represent it. */
export function JsonSourceLiteralsProvider({ diagnostics, children }: {
  diagnostics: readonly SourceDiagnostic[]
  children: ReactNode
}) {
  const literalsContext = useMemo<SourceLiterals>(() => {
    const literals = new Map(diagnostics.filter((issue) => issue.code === 'unsafe-number' && !issue.shadowed)
      .map((issue) => [JSON.stringify(issue.sourcePath), issue.token]))
    return {
      lookup: (path) => path == null ? undefined : literals.get(JSON.stringify(path)),
      containsRisk: (path) => path !== undefined && diagnostics.some((issue) => path.length <= issue.sourcePath.length && path.every((part, index) => part === issue.sourcePath[index])),
    }
  }, [diagnostics])
  return <SourceLiteralsContext.Provider value={literalsContext}>{children}</SourceLiteralsContext.Provider>
}

export function useJsonSourceLiterals(): LiteralLookup {
  return useContext(SourceLiteralsContext).lookup
}

export function useJsonSourceSubtreeRisk(path?: ValuePath): boolean {
  return useContext(SourceLiteralsContext).containsRisk(path)
}

export function JsonSourceNumber({ literal }: { literal: string }) {
  return <span data-id="jsonView-exact-source-number" className="min-w-0 break-all font-mono text-foreground" title="Exact numeric literal from JSON source">{literal}</span>
}
