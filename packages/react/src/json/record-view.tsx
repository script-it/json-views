import { useJsonSourceLiterals } from './source-literals.js'
import { useEffect, useState, type ReactNode } from 'react'
import { cn } from '../lib/cn.js'
import type { UiSize } from '../lib/ui-size.js'
import { AtomicValueEditor } from '../structured-data/atomic-value-editor.js'
import { isEditableAtomicValue } from '../structured-data/atomic-value.js'
import { ValueCell, ValueCellContent } from '../tabular-data-view.js'
import { type ValuePath } from '@script-it/json-views-core'
import { getValueAtPath, VALUE_PATH_MISSING } from '@script-it/json-views-core'
import { schemaForJsonViewPath, type CompiledJsonViewMetadata, type CompiledJsonViewView, type JsonViewViewRow } from '@script-it/json-views-core'
import { JsonViewSchemaValueCell, type JsonViewSchemaExternalWidgetRenderer } from './schema-value.js'
import { isLongText } from './long-text.js'
import { GeneralJsonView, NavigationBreadcrumb, type GeneralJsonRecordTarget } from './viewers/general/general-json-view.js'
import { type JsonViewJsonEditing } from './view-types.js'
import { nestedRecordView, titleFieldForRow, titleForRow } from './view-model.js'
import { jsonPathReference, jsonRecordCopyText } from './copy-json.js'
import { CopyJsonAction } from '../structured-data/copy-json-action.js'
import { useViewerState } from '../viewer-state.js'

interface GeneralRecordViewProps extends GeneralJsonRecordTarget {
  compiled: CompiledJsonViewMetadata
  editing?: JsonViewJsonEditing
  filePath?: string
  copyFileName: string
  fillHeight: boolean
  name: string
  onCurrentPathChange?: (path: ValuePath) => void
  renderExternalWidget?: JsonViewSchemaExternalWidgetRenderer
  renderMarkdown?: (content: string) => ReactNode
  uiSize?: UiSize
}

export function GeneralRecordView({ path, titleKey, name, ...props }: GeneralRecordViewProps) {
  const target = nestedRecordView(props.compiled.root, path, titleKey, name)
  if (!target) return null
  return <RecordView {...props} row={target.row} view={target.view} />
}

export function RecordView({
  compiled,
  editing,
  filePath,
  copyFileName,
  fillHeight,
  onBack,
  breadcrumbLabels,
  backLabel,
  editPath,
  onCurrentPathChange,
  renderExternalWidget,
  renderMarkdown,
  row,
  uiSize,
  view,
}: {
  compiled: CompiledJsonViewMetadata
  editing?: JsonViewJsonEditing
  filePath?: string
  copyFileName: string
  fillHeight: boolean
  editPath?: ValuePath
  onBack?: () => void
  breadcrumbLabels?: readonly string[]
  backLabel?: string
  onCurrentPathChange?: (path: ValuePath) => void
  renderExternalWidget?: JsonViewSchemaExternalWidgetRenderer
  renderMarkdown?: (content: string) => ReactNode
  row: JsonViewViewRow
  uiSize?: UiSize
  view: CompiledJsonViewView
}) {
  const sourceLiteral = useJsonSourceLiterals()
  const { navigation } = useViewerState()
  const suppressRequiredValidation = editing?.isDraftRow?.(row.sourcePath) === true
  const nestedStateKey = `${filePath ?? 'json'}#record:${JSON.stringify(row.sourcePath)}`
  const [nestedPath, setNestedPath] = useState<ValuePath | undefined>(() => {
    const restored = filePath ? navigation.get(nestedStateKey)?.currentPath : undefined
    return restored && restored.length > row.sourcePath.length
      && row.sourcePath.every((segment, index) => segment === restored[index])
      && getValueAtPath(compiled.root, restored) !== VALUE_PATH_MISSING ? restored : undefined
  })
  useEffect(() => {
    if (nestedPath && (getValueAtPath(compiled.root, nestedPath) === VALUE_PATH_MISSING
      || !row.sourcePath.every((segment, index) => segment === nestedPath[index]))) setNestedPath(undefined)
  }, [compiled.root, nestedPath, row.sourcePath])
  useEffect(() => {
    if (!filePath) return
    const currentPath = nestedPath ?? row.sourcePath
    if (JSON.stringify(navigation.get(nestedStateKey)?.currentPath) !== JSON.stringify(currentPath)) {
      navigation.set(nestedStateKey, { stack: [], currentPath })
    }
  }, [filePath, navigation, nestedPath, nestedStateKey, row.sourcePath])
  useEffect(() => {
    if (!nestedPath) onCurrentPathChange?.(row.sourcePath)
  }, [nestedPath, onCurrentPathChange, row.sourcePath])
  const titleField = titleFieldForRow(compiled.root, view, row)
  const rowTitle = titleField ? sourceLiteral(titleField.path) ?? titleForRow(compiled.root, view, row) : ''
  const titleSchema = titleField ? schemaForJsonViewPath(compiled.schema, titleField.path) : undefined
  const titleDescriptor = titleSchema?.descriptor
  const titleTopLevelKey = titleField
    && titleField.path.length === row.sourcePath.length + 1
    && titleField.path.slice(0, row.sourcePath.length).every((segment, index) => segment === row.sourcePath[index])
    && typeof titleField.path[titleField.path.length - 1] === 'string'
      ? titleField.path[titleField.path.length - 1] as string
      : undefined
  if (nestedPath) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <GeneralJsonView
          breadcrumb={{ ancestors: row.sourcePath.map(String), backLabel: 'Back to record', onBack: () => setNestedPath(undefined) }}
          root={compiled.root}
          initialPath={nestedPath}
          defaultKey={String(nestedPath[nestedPath.length - 1] ?? view.name)}
          filePath={`${filePath ?? 'json'}#${view.id}:nested:${JSON.stringify(nestedPath)}`}
          editing={editing}
          onCurrentPathChange={onCurrentPathChange}
          renderExternalWidget={renderExternalWidget}
          renderMarkdown={renderMarkdown}
          schemaForPath={(path) => schemaForJsonViewPath(compiled.schema, path)?.descriptor}
          uiSize={uiSize}
          fillHeight={fillHeight}
          renderRecord={(target) => (
            <GeneralRecordView
              {...target}
              compiled={compiled}
              copyFileName={copyFileName}
              editing={editing}
              filePath={filePath}
              fillHeight={fillHeight}
              name={view.name}
              onCurrentPathChange={onCurrentPathChange}
              renderExternalWidget={renderExternalWidget}
              renderMarkdown={renderMarkdown}
              uiSize={uiSize}
            />
          )}
        />
      </div>
    )
  }

  const entries = Object.entries(row.value).filter(([key]) => key !== titleTopLevelKey && key !== '$jsonviews')
    .sort(([left, leftValue], [right, rightValue]) => Number(isLongText(leftValue, schemaForJsonViewPath(compiled.schema, [...row.sourcePath, left])?.descriptor)) - Number(isLongText(rightValue, schemaForJsonViewPath(compiled.schema, [...row.sourcePath, right])?.descriptor)))
  return (
    <div data-id="jsonView-record-view" className={cn('flex min-h-0 flex-1 flex-col', fillHeight && 'overflow-y-auto')}>
      <NavigationBreadcrumb labels={breadcrumbLabels ?? row.sourcePath.map(String)} onBack={onBack} backLabel={backLabel} />
      <article className="mx-auto w-full max-w-2xl px-3 pb-6 sm:px-6">
        {titleField && <div data-id="jsonView-record-title-label" title={String(titleField.path[titleField.path.length - 1])} className="mb-1 text-xs text-muted-foreground">
          {titleDescriptor?.title ?? titleField.label.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/^./, (letter) => letter.toUpperCase())}
        </div>}
        <div className="-mx-1.5 flex min-w-0 items-start justify-end gap-1.5">
          {titleField && <div data-id="jsonView-record-title" role="heading" aria-level={2} className="min-w-0 max-w-full flex-1 text-xl font-semibold tracking-tight">
            {titleField && titleDescriptor ? (
            <JsonViewSchemaValueCell
              sourcePath={titleField.path}
              descriptor={titleDescriptor}
              suppressRequiredValidation={suppressRequiredValidation}
              onOptionColorChange={editing?.setOptionColor && titleSchema ? (optionValue, color) => editing.setOptionColor!(titleSchema.declaration, optionValue, color) : undefined}
              inputKey={String(titleField.path[titleField.path.length - 1] ?? 'title')}
              label={titleDescriptor.title ?? titleField.label}
              value={titleField.value}
              onOpen={() => undefined}
              onClear={editing ? () => editing.clear(titleField.path) : undefined}
              onCommit={editing && editing.canReplace?.(titleField.path) !== false ? (next) => editing.replace(titleField.path, next) : undefined}
              renderExternalWidget={renderExternalWidget}
              renderMarkdown={renderMarkdown}
              saving={editing?.saving}
              variant="record-title"
            />
          ) : titleField && editing && editing.canReplace?.(titleField.path) !== false && isEditableAtomicValue(titleField.value) ? (
            <AtomicValueEditor
              className="min-h-10 w-fit max-w-full px-1.5 py-1"
              editorClassName="min-h-10 text-xl font-semibold tracking-tight"
              label={titleField.label}
              preserveLayout
              value={titleField.value}
              saving={editing.saving}
              onCommit={(next) => editing.replace(titleField.path, next)}
            >
              <span className="break-words">{rowTitle}</span>
            </AtomicValueEditor>
            ) : <span className="block px-1.5 py-1">{rowTitle}</span>}
          </div>}
          <CopyJsonAction
            className="mt-1.5"
            dataId="jsonView-copy-record"
            getPathText={() => jsonPathReference(copyFileName, row.sourcePath)}
            getRecordText={() => jsonRecordCopyText(row.value, row.sourcePath, sourceLiteral)}
            label="Copy path"
            pathLabel="path"
            recordLabel="record"
          />
        </div>
        <dl className={cn("grid grid-cols-[minmax(6rem,10rem)_minmax(0,1fr)] gap-x-4 text-xs", titleField && "mt-5")}>
          {entries.map(([key, value]) => {
            const path: ValuePath = [...row.sourcePath, key]
            const schema = schemaForJsonViewPath(compiled.schema, path)
            const descriptor = schema?.descriptor
            const focusedNested = editPath && editPath.length > path.length && path.every((part, index) => editPath[index] === part)
              ? nestedRecordView(compiled.root, path, undefined, key) : undefined
            if (focusedNested) return <div key={key} className="col-span-2 min-w-0 py-3">
              <dt className="mb-2 text-muted-foreground">{descriptor?.title ?? key}</dt>
              <dd><RecordView compiled={compiled} row={focusedNested.row} view={focusedNested.view} editPath={editPath} editing={editing} filePath={filePath} copyFileName={copyFileName} fillHeight={false} renderMarkdown={renderMarkdown} renderExternalWidget={renderExternalWidget} uiSize={uiSize} /></dd>
            </div>
            if (typeof value === 'string' && (!descriptor || ['text', 'markdown', 'html'].includes(descriptor.type))) {
              const wide = isLongText(value, descriptor)
              return <RecordTextProperty key={key} wide={wide} value={value} descriptor={descriptor?.type === 'markdown' || descriptor?.type === 'html' ? descriptor : { ...descriptor, type: 'text', multiline: wide }} path={path} label={descriptor?.title ?? key} editing={editing} initiallyEditing={JSON.stringify(editPath) === JSON.stringify(path)} renderMarkdown={renderMarkdown} />
            }
            return (
              <div key={key} className="contents">
                <dt className="min-w-0 break-words py-3 text-muted-foreground">{descriptor?.title ?? key}</dt>
                <dd className="min-w-0 overflow-hidden py-1.5">
                  {descriptor ? (
                    <JsonViewSchemaValueCell
                      sourcePath={path}
                      descriptor={descriptor}
                      suppressRequiredValidation={suppressRequiredValidation}
                      onOptionColorChange={editing?.setOptionColor && schema ? (optionValue, color) => editing.setOptionColor!(schema.declaration, optionValue, color) : undefined}
                      label={descriptor.title ?? key}
                      value={value}
                      inputKey={key}
                      onOpen={() => setNestedPath(path)}
                      onClear={editing ? () => editing.clear(path) : undefined}
                      onCommit={editing && editing.canReplace?.(path) !== false ? (next) => editing.replace(path, next) : undefined}
                      renderExternalWidget={renderExternalWidget}
                      renderMarkdown={renderMarkdown}
                      saving={editing?.saving}
                    />
                  ) : isEditableAtomicValue(value) && editing && editing.canReplace?.(path) !== false ? (
                    <AtomicValueEditor label={key} value={value} saving={editing.saving} onCommit={(next) => editing.replace(path, next)}>
                      <ValueCellContent sourcePath={path} value={value} onOpen={() => undefined} />
                    </AtomicValueEditor>
                  ) : (
                    <ValueCell sourcePath={path} value={value} onOpen={() => setNestedPath(path)} />
                  )}
                </dd>
              </div>
            )
          })}
        </dl>
      </article>
    </div>
  )
}

function RecordTextProperty({ value, descriptor, path, label, editing, initiallyEditing, renderMarkdown, wide }: {
  value: string
  descriptor: import('@script-it/json-views-core').JsonViewSchemaDescriptor
  path: ValuePath
  label: string
  editing?: JsonViewJsonEditing
  initiallyEditing: boolean
  renderMarkdown?: (content: string) => ReactNode
  wide: boolean
}) {
  return <div className={wide ? 'col-span-2 min-w-0 py-3' : 'contents'}>
    <dt className={cn('min-w-0 text-muted-foreground', wide ? 'mb-2 flex items-center justify-between gap-2' : 'py-3')}>
      <span className="break-words">{label}</span>

    </dt>
    <dd className={cn('min-w-0', !wide && 'py-1.5')}>
      <JsonViewSchemaValueCell renderMarkdown={renderMarkdown} descriptor={descriptor} sourcePath={path} value={value} label={label} initiallyEditing={initiallyEditing} onOpen={() => undefined} onCommit={editing && editing.canReplace?.(path) !== false ? next => editing.replace(path, next) : undefined} onClear={editing ? () => editing.clear(path) : undefined} saving={editing?.saving} />
    </dd>
  </div>
}
