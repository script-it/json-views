# JSON Views nuances

Supplement to the JSON Views skill. Use the main guide for product context, viewer setup, API basics, and JSON authoring; read the sections here only when their edge cases apply.

## Viewer and API nuances

- `browser`: asynchronous IndexedDB cache for this site/profile; no JSON upload backend. Successful writes may precede cache completion; clearing site data removes documents. Download for an independent copy.
- `local-file`: revision-checked writes to the connected disk file. Reread after a conflict before retrying.
- `example`: edits are not cached as user documents; download or create a browser copy to retain them.
- For CSV, read/write exact text with `source()`/`setSource()`; `get()`/`patch()` require JSON.
- Invalid source/patch writes change nothing. JavaScript rejects with `error.diagnostics`; WebMCP returns `{ ok: false, saved: false, diagnosticTarget, diagnostics }`. Other failures remain errors.
- Diagnostics include `scope`, `code`, `severity`, `message`, data/metadata paths, and repair `help`.

To direct the user to relevant data, return `jsonViews.link("tasks.json", "Board")`. URLs use `#/files/<filename-or-folder-path>/views/<view-name>`; encode each placeholder with `encodeURIComponent`. Names are case-sensitive and must be unique; renames break old links. These links open existing files in the same browser workspace, not shared copies. Use snapshot sharing for another browser. Local-file URLs retain their access token and must stay private.

## Schema and inference nuances

- Host-supplied external metadata takes precedence over embedded metadata. Explicit metadata replaces inference rather than merging with it.
- Saving an inferred view's settings writes predicted schema and views into `$jsonviews`.
- Compact, deeply nested JSON without a useful table or declared view can open in Source by default. Saved selections take precedence.
- Complete HTML pages and styled fragments infer `html`; simpler formatting infers Markdown, including when other strings in the property are plain text. Explicit `text` overrides inference.
- Markdown properties appear at the end of records without type selectors or preview buttons. Legacy `body` annotations become Markdown and no longer hide properties or limit records to one rich-text field.
- `required: true` rejects missing/null values and empty strings; it does not enforce collection size. Empty multi-select arrays are valid even when required. An existing empty collection has no required child instances.
- Floating timestamps have no timezone; add `Z` or an offset only when the intended timezone is known. Date-only comparisons use the written calendar day.
