# Updating built-in documents

The website and CLI bundle `apps/web/public/representative-examples/manifest.json`.
Each entry has a permanent `documentId`, separate from its source path and display
name. Never change or reuse that ID when renaming or moving a file. Existing IDs
retain their historical strings to preserve saved edits without re-keying storage.
New entries can use a simple ID such as `builtin:my-document`.

`apps/web/src/builtin-documents.ts` reconciles the current bundle with browser
storage at startup:

- Untouched built-ins load their latest bundled content.
- Cached edits keep their source and receive the current filename, folder and label.
- Removed built-ins disappear; cached edited copies remain available.
- Saved selection and presentation use document IDs. Legacy filename-based state
  is read as a fallback and rewritten using IDs on the next save.
- A removed saved view falls back to the first current view (or the root).

The app caches built-in source only after editing. Cached source is conservatively
considered user-owned, including edits later reverted by the user. It is never
silently replaced with a newer bundle. Imported and CLI files are independent.

When updating an entry, update its `bytes` and `sourceSha256`, and run the web tests.
Keep asset URLs relative to the app base so deployments under subpaths work.
The guide's images and animated WebP demo live in `apps/web/public/landing-assets/`.
