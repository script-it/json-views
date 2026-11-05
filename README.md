# JSON Views

<a href="https://json-views.com/"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/readme/website-dark.svg"><img src="docs/readme/website-light.svg" alt="Open json-views.com" height="38"></picture></a>

Open your agent to set up JSON Views:

<a href="https://json-views.com/install.html?agent=claude"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/readme/claude-code-dark.svg"><img src="docs/readme/claude-code-light.svg" alt="Claude Code" height="38"></picture></a>
<a href="https://json-views.com/install.html?agent=codex"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/readme/codex-dark.svg"><img src="docs/readme/codex-light.svg" alt="Codex" height="38"></picture></a>
<a href="https://json-views.com/install.html?agent=cursor"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/readme/cursor-dark.svg"><img src="docs/readme/cursor-light.svg" alt="Cursor" height="38"></picture></a>
<a href="https://grok.com/?q=Install%20the%20JSON%20Views%20skill%3A%20npx%20skills%20add%20script-it%2Fjson-views%20-g"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/readme/grok-bot-dark.svg"><img src="docs/readme/grok-bot-light.svg" alt="Grok" height="38"></picture></a>

Today, the formats for structured data leave a gap between people and agents:

- **CSV** is not expressive enough for nested or rich data.
- **JSON** is expressive and easy for agents to edit, but hard for people to navigate and change.
- **Excel (XLSX)** is comfortable for people, but cumbersome for agents to read and edit.

JSON Views closes that gap. It keeps the data in plain JSON, which agents already handle well, and shows it to people the way a Notion database would: tables, boards and pages they can browse and edit. What Markdown does for text documents, JSON Views does for structured data: it makes a format machines handle well comfortable for people too.

A small `$jsonviews` property inside the file can hold the column types and saved views, so people jump straight to the useful tables instead of the whole JSON tree. Agents can edit that property too, to set up those views for the people they work with.

![json-views — paste JSON, get a table and a board, and edits land back in the JSON](./docs/readme/json-views-demo.gif)

## What it is

A JSON viewer and editor for people and agents. It works on [json-views.com](https://json-views.com/), inside React apps, and on local files.

Open a JSON or CSV file and you see tables, records you can drill into, Kanban boards, filters and sorting instead of raw text. Edits change only the values you touch; the rest of the file keeps its exact text. The core and React packages do not depend on Script.it APIs or styling, and you can add your own types and widgets.

**Release status: public beta.** Report problems and ideas in [GitHub Issues](https://github.com/script-it/json-views/issues). For an app that uses the published packages, see the [installed-package consumer](examples/consumer/README.md).

## Open a local file

```bash
npx @script-it/json-views ./data.json
```

A browser tab opens on the file. That tab can read and save only the file you named, and the server listens only on `127.0.0.1`.

Saving replaces the file in one step and keeps its permissions. If the file changed on disk since you opened or last saved it, the save is refused with a conflict instead of overwriting the other change. Saves are queued per file within one `json-views` process, but two separate processes do not lock each other out; see the [local file and agent API](packages/cli/README.md#local-file-and-agent-api).

Add `--no-open` when an agent or another tool should use the printed URL and local API instead of a browser tab.

## Use the website

[json-views.com](https://json-views.com/) opens files you upload or paste and lets you download them. Share links are currently disabled on the public website. Documents stay in the browser. The site has no upload backend.

**Share links.** A share link carries the whole document, compressed, in the part of the URL after `#`, so the document is not sent to the server. The link keeps the exact text and the filename. Links over 8 KB show a warning that some apps may not handle them; links over 32 KB are refused. Anyone who receives a share link can read the document, so treat it as public.

**What you get back when you return.** The site reopens your last document with the same view, Table or Source tab, searches, place in the document, column widths and scroll positions. None of this is written into `$jsonviews`.

> Technical note: The workspace is stored in IndexedDB. During page unload, a session-storage backup keeps each tab's latest view changes; it holds no document content or metadata.

**Editing source.** Imported text stays exactly as it was, including whitespace and large numeric IDs. Edits in the Source tab take effect only when you click **Apply** (**Save** for a file opened from the CLI). **Format** reformats only when you click it. Broken JSON stays open so you can fix it or download it. Uploading while connected to a CLI session creates a separate browser document; it does not replace the local file.

**Several tabs.** Tabs on the same site share one workspace. Saving one file does not block saves to another. Other tabs update when a document changes, or when they regain focus if they missed the update. If two tabs edit the same file's source, the second save is refused, and that tab offers **Use saved version** (your draft stays downloadable) or **Save draft as copy**. Changes to one file from two tabs are never merged automatically. Deleting a file that another tab has open asks that tab to acknowledge before it closes. Each tab keeps its own view, Source tab and view settings.

> Technical note: Each save checks the document's revision inside the IndexedDB write transaction. Tabs are notified through BroadcastChannel.

**Usage counts.** json-views.com counts which interface opened a document and whether it was JSON or CSV. It never records the filename, the document or any value in it, and it sets no cookie and no persistent identifier. Turn it off in Settings. The `@script-it/json-views-core`, `-react` and CLI packages send no usage data and make no network requests.

### Browser console API

The website exposes `window.jsonViews` to DevTools, browser extensions and scripts running in the page. `jsonViews.help()` explains the product, the API and how to write JSON with views; WebMCP serves the same guide as `json_views_help`.

```js
const documents = jsonViews.list()
const tasks = jsonViews.get('tasks.json')
const inspection = jsonViews.diagnostics('tasks.json')

await jsonViews.create('notes.json', { notes: [] })
await jsonViews.patch('tasks.json', [
  { op: 'test', path: '/tasks/0/done', value: false },
  { op: 'replace', path: '/tasks/0/done', value: true },
])
```

Every command updates what is on screen and saves where that document lives: the browser workspace, or the local file for a document opened from the CLI.

- `patch()` applies [RFC 6902](https://www.rfc-editor.org/rfc/rfc6902) operations with [RFC 6901](https://www.rfc-editor.org/rfc/rfc6901) paths, all or nothing. Text it does not touch is kept as it was. A failed patch saves nothing and returns diagnostics.
- `source()` returns the exact text. `setSource()` replaces it, after checking that it is valid JSON.
- Every write returns the document's info with `diagnostics` covering the source, annotations, views and values. `diagnostics()` returns the same check without changing anything. `valid` says whether the source itself can be saved.
- `list({ includeDiagnosticCount: true })` adds issue counts. When two documents share a filename, use the `id` from `list()`.

The guide is built from the [agent skill](skills/json-views/SKILL.md), the [nuances reference](skills/json-views/references/jsonviews.md) and the [HTML views reference](skills/json-views/references/html-views.md). Edit those files, not `apps/web/src/agent-help.md`, which the dev server, builds and tests generate and bundle so the guide needs no extra request.

### WebMCP

In browsers and agent clients that support [WebMCP](https://webmachinelearning.github.io/webmcp/), the website registers tools to list, read, check, create, patch, select and delete documents. Agents work on the visible workspace without clicking or running console commands. `json_views_get_diagnostics` reports existing issues; create, patch and source-replacement results include the same diagnostics the website shows. The tools save the same way `window.jsonViews` does. Browsers without WebMCP work as before.

## Automatic types and views

You don't need `$jsonviews` for ordinary JSON. JSON Views guesses types and views when it opens a file and never changes the file to do so.

What you see:

- **Edit widgets.** Booleans, finite numbers, web URLs, email addresses, ISO dates and long text get matching widgets.
- **Select fields.** A field becomes a select when its name sounds like a category (mode, platform and channel count, including labels with slashes) and it has a few short values, each used at least twice, across four or more records. One value repeated is enough. Multi-select needs the same repetition in tags, labels, categories or departments. Arbitrary names, IDs and string arrays stay plain text.
- **Tables.** A collection becomes a table with at least three records and columns worth comparing: filled in and of one type. With four shared, varying, simple columns and at least 60% readable top-level fields, extra and nested fields are allowed. Otherwise 80% of fields must be shared and readable, with at least two useful columns.
- **Kanban.** A table also gets a board when records have distinct readable titles and a `status`, `state`, `stage` or `phase` field with two to six recurring values, at least two records each, and recognizable workflow values such as Open, In progress or Done. Health states such as healthy or down don't count.
- **Columns.** Records whose fields are all simple values stay tabular even with null or constant fields. Consistent nested objects can add up to 12 columns, from at most two levels down. Arrays never turn into extra rows.
- **What gets a tab.** A collection inside one record of a dictionary does not get its own tab. A collection inside a response wrapper, such as `{ "data": [...] }`, can.

**Table and Source.** Every document has a Table tab (table icon) and a Source tab (`{ }` icon). Table browses the whole document; where a record table doesn't fit, it shows a property list with expandable values. Guessed views appear as extra tabs, never as a duplicate of the root. Table opens by default, except for small, deeply nested JSON, which opens in Source: at most 100 lines when pretty-printed and 8,000 characters, with at least 60% of simple values three or more levels deep, and no declared view or natural table. A tab you chose before always wins.

Saved tab choices and views declared in `$jsonviews` take precedence over guesses. CSV is always a table, however few rows it has. Saving a guessed view's settings writes the guessed schema and views into `$jsonviews`, where you can rename and change them.

## Add views and types to JSON

To declare views and types yourself, add a `$jsonviews` object to an object root:

```json
{
  "$jsonviews": {
    "version": 1,
    "schema": {
      "$.contacts[*].name": { "type": "text", "title": "Name" },
      "$.contacts[*].status": {
        "type": "select",
        "options": ["New", "Qualified", "Customer"]
      }
    },
    "views": [
      {
        "id": "contacts",
        "name": "Contacts",
        "path": "$.contacts",
        "columns": [
          { "label": "Name", "path": "$.contacts[*].name" },
          { "label": "Status", "path": "$.contacts[*].status" }
        ]
      }
    ]
  },
  "contacts": [
    { "name": "Ada", "status": "Customer" }
  ]
}
```

The built-in types are `text`, `markdown`, `html`, `number`, `checkbox`, `select`, `multi-select`, `date`, `url` and `email`.

- **Markdown** shows rendered and edits as source text. Markdown fields appear at the end of each record. A field is treated as Markdown when it has recognizable formatting. Old `body` annotations still work as Markdown, and a record can have more than one.
- **HTML** is detected in complete pages and styled fragments and shows in an isolated preview.
- **Long text** stays visible in tables. On the website, Markdown uses a pencil button to enter editing; clicking its content follows links or selects text. React consumers can enable the same behavior with `buttonToEdit`; the package defaults to click-to-edit.
- An explicit `text` annotation turns detection off for that field.

**Select options are suggestions, not a closed list.** People and agents can type a new option into either widget, and any value already in the document is offered to every matching field.

**Colors.** Give options fixed colors with `optionColors`, for example `"optionColors": { "New": "blue", "Customer": "green" }`. The colors are `gray`, `blue`, `green`, `yellow`, `orange`, `red`, `purple` and `pink`. When annotations can be saved, the select menus show the same colors beside each option.

**New view** starts from where you are in the document. A single record becomes an editable page; a collection becomes a table or a Kanban board, and a board remembers the property it groups by. Arrays and simple values keep their normal layout.

**Root arrays.** A root array has nowhere to hold `$jsonviews`. Before you save the first view, JSON Views warns you and asks you to click **Wrap and create view**. That changes the file to `{ "$jsonviews": {...}, "data": [...] }`, moves guessed paths under `$.data`, and keeps every item.

## Use it in React

```tsx
import { JSONContent } from '@script-it/json-views-react'
import '@script-it/json-views-react/styles.css'

export function Viewer({ source, save }: { source: string; save: (next: string) => Promise<void> }) {
  return (
    <JSONContent
      documentId="workspace:file-id"
      content={source}
      path="data.json"
      theme="inherit"
      edit={{
        isEditing: false,
        editContent: source,
        onEditChange: () => undefined,
        onCommitContent: save,
      }}
    />
  )
}
```

To keep application JSON free of `$jsonviews`, pass annotations through the `metadata` prop instead. This also works for array and primitive roots.

| Package | What it is |
| --- | --- |
| `@script-it/json-views-core` | Type and view guessing, `$jsonviews` compilation, the JSONPath subset, validation, the view model and edits that keep the rest of the source text |
| `@script-it/json-views-react` | The viewer UI, with type and widget registries |
| `@script-it/json-views` | The local file CLI and browser host; installs the `json-views` command |
| `@script-it/json-views-web` | The static website: upload, paste, download |

Each package documents its own contract: [the annotation specification](packages/core/README.md#annotation-specification), [React integration](packages/react/README.md#react-integration) and [the local file and agent API](packages/cli/README.md#local-file-and-agent-api).

## Agent skill

[`skills/json-views`](skills/json-views/SKILL.md) is a portable skill that teaches agents to open local files, save through the revision-checked API, write `$jsonviews` metadata and check that saved views work.

## Develop

You need Node.js 22.13 or later in the 22 series, or Node.js 24 or later. React 18 and 19 are supported. The UI uses modern CSS, including nesting and `color-mix`; older browsers need a compatibility build from the host app.

```bash
npm ci
npm test
npm run check
npm run build
npm run dev
```

`npm run check:release` also installs the real npm tarballs into a separate app and checks ESM, React server rendering, strict TypeScript, browser bundling and the installed CLI. CI runs Node 22 and 24 with React 18 and 19. Read [Contributing](CONTRIBUTING.md) before changing a public contract.

## License and trademarks

The code in this repository is MIT licensed; see [LICENSE](LICENSE).

The MIT license covers the code only. The Script.it and JSON Views names, logos and other brand assets remain the property of Script.it. A fork may use the code freely, but should use its own name and marks rather than present itself as Script.it or JSON Views.
