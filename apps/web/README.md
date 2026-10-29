# @script-it/json-views-web

The static website at [json-views.com](https://json-views.com/). It hosts the JSON Views viewer for documents uploaded, pasted, or created in the browser, and for one local file opened through the CLI. This package is not published to npm.

## Documents, sharing, and tabs

The [browser editor](https://json-views.com/) supports upload, paste, download, share links, and a browser-local workspace backed by IndexedDB. Share links gzip the active JSON or CSV document, preserve its exact source and filename, and place the encoded data in the URL fragment so it is not sent to the server. Links longer than 8 KB carry an interoperability warning and links longer than 32 KB are rejected. Treat a share link as public to anyone who receives it.

The editor restores the last document, selected view, source/view mode, searches, navigation, table widths, transient presentation controls, and scroll positions per document without adding cache data to `$jsonviews`. A synchronous session-storage backup preserves each tab’s latest presentation changes during page unload; it contains no document content or metadata. The standalone static site has no upload backend. Imported text stays exact, including whitespace and large numeric IDs. Source edits require **Apply** (or **Save** for a CLI file); **Format** is an explicit action. Malformed JSON remains available for repair and download. Uploading from a CLI session creates a separate browser document.

Browser tabs on the same origin share versioned documents in IndexedDB. Saves compare each changed document’s revision inside the write transaction, so edits to different files can save independently. BroadcastChannel notifications refresh other tabs, with a focus/visibility refresh when a notification was missed. Conflicting source edits stay in the current tab: choose **Use saved version** (the previous draft remains downloadable) or **Save draft as copy**. Deleting an active file in another tab requires acknowledgment before it closes. View selection, source mode, and presentation controls remain independent per tab. Concurrent changes within one file are not automatically merged.

## Creating views

The **New view** flow starts from the current JSON path. A single record becomes an editable page, while a record collection can become a table or Kanban board. Kanban creation also records the selected grouping property; arrays and scalar paths keep their natural JSON layout.

A root array cannot contain `$jsonviews` metadata directly. Before the first saved view, JSON Views shows a warning and requires an explicit **Wrap and create view** action. This changes the root to `{ "$jsonviews": {...}, "data": [...] }`, rebases inferred paths to `$.data`, and preserves the array items.

Assign stable option colors with `optionColors`, for example `"optionColors": { "New": "blue", "Customer": "green" }`. The built-in palette is `gray`, `blue`, `green`, `yellow`, `orange`, `red`, `purple`, and `pink`. When annotations are writable, the select and multi-select menus expose the same palette beside each option.

## The landing page

The site opens on the bundled **About JSON Views** guide. Its **What is this?** view is the landing page, and **Articles** lists every article. Both are ordinary JSON Views data: the landing page is one Markdown field rendered as a page, so it can be edited like any other value. Markdown fields support a few link forms for pages like this:

| Markdown | Behavior |
| --- | --- |
| `[Label](target "button")` or `"button primary"` | Renders the link as a button. |
| `[Label](#/files/<file>/views/<view>)` | Opens a bundled or workspace file at a view, in the same tab. |
| `[Label](#heading-text)` | Scrolls to the heading whose text matches. |
| `[Label](#copy:<url-encoded text>)` | Copies the text to the clipboard. |
| `claude:`, `codex:`, `cursor:`, `grokbot:` links | Open that agent with a prompt; other non-web protocols are removed. |

Fenced code blocks get a **Copy** button.

`demo.html` (source in `src/demo.tsx`) is the live demo embedded under the landing page title: an agent edits a task list on the left while the real viewer updates on the right, until the visitor clicks and takes over. Markdown fields embed only this page; every other iframe is dropped.

The agent logos in `public/icons/agents/` come from [lobe-icons](https://github.com/lobehub/lobe-icons) (`@lobehub/icons-static-svg` 1.101.0, MIT). The logos are trademarks of their owners and are used only to label the setup buttons for those agents.

The landing page's images live in `public/home/`. `public/install.html` lets a README link open Claude Code, Codex, Cursor, or Grok: it maps `?agent=` to the same app links as the landing page and ignores any other value.

## Agent help and the published skill

Edit the main [agent skill](../../skills/json-views/SKILL.md), [nuances reference](../../skills/json-views/references/jsonviews.md), and [HTML views reference](../../skills/json-views/references/html-views.md); web development, builds, and tests combine them into `apps/web/src/agent-help.md` and bundle it for use without another network request. Builds also publish the skill and its reference files at `/SKILL.md` and `/references/`, so agents can install it from the site.
