import { inspectJsonSource, type ValuePath } from '@script-it/json-views-core'

type SourceDiagnostic = ReturnType<typeof inspectJsonSource>['diagnostics'][number]

function containsPath(parent: ValuePath, child: ValuePath): boolean {
  return parent.length <= child.length && parent.every((segment, index) => segment === child[index])
}

export function replacementIssue(diagnostics: readonly SourceDiagnostic[], path: ValuePath): SourceDiagnostic | undefined {
  return diagnostics.find((issue) => containsPath(path, issue.sourcePath)
    || (issue.code === 'duplicate-key' && containsPath(issue.sourcePath, path)))
}

/** Source-preserving mutations must still address an unambiguous JSON location. */
export function assertUnambiguousSourcePath(source: string, paths: readonly ValuePath[]): void {
  const issue = inspectJsonSource(source).diagnostics.find((diagnostic) => diagnostic.code === 'duplicate-key'
    && paths.some((path) => containsPath(diagnostic.sourcePath, path)))
  if (issue) throw new Error('This path contains a duplicate property name. Edit the JSON source to disambiguate it first.')
}

/** Replacing a subtree would serialize all its numbers and duplicate properties. */
export function assertSourceReplacementSafe(source: string, paths: readonly ValuePath[]): void {
  const diagnostics = inspectJsonSource(source).diagnostics
  if (paths.some((path) => replacementIssue(diagnostics, path))) {
    throw new Error('This value contains a number or duplicate property that cannot be represented losslessly. Edit the JSON source for this value.')
  }
}
