# HTML views

Use `display: "html"` for a layout over document data. Set a concrete `path`, a non-empty `html` template, and optional `css`. See the combined example in the main skill.

## Bindings and restrictions

| Interaction | Binding | Behavior |
| --- | --- | --- |
| Read-only value | `<jv-value bind="task.title"></jv-value>` | Displays a scalar. |
| Schema editor | `<jv-field bind="task.status"></jv-field>` | Opens the field's schema/registry editor. |
| Native input | `jv-bind="task.title"` on `input` or `textarea` | Edits the original value; input types: text, number, range, checkbox. |
| Repeat | `<jv-repeat source="$.tasks" as="task">...</jv-repeat>` | Renders array items; `task` aliases the current item. Optional `key="id"` preserves identity using an existing unique property; IDs are not required. |

**Restrictions:** Use explicit closing tags for custom elements. `$` is the document root; bindings must resolve within the view's `path`, exclude `$jsonviews`, and contain no wildcards, expressions, arithmetic, or functions. Bind scalar fields; use repeats for arrays. Missing paths, including repeat arrays, are errors. HTML and CSS are strings, limited to 256 KiB each; style through `css`. Isolated templates do not support scripts, computed values, event handlers, forms, navigation, external resources, or inline styles. HTML views cannot use `columns`, `filter`, `sort`, `groupBy`, `groupOrder`, or `orderPath`. Check renderer warnings as well as metadata diagnostics.

## HTML interaction nuances

Range commits at pointer/keyboard completion; text, number, and textarea commit on blur or Enter, and Shift+Enter inserts a line break in a textarea (on mobile, Return inserts it and Ctrl/Cmd+Enter commits). Escape cancels. A failed native edit can be retried by completing the interaction again. Shared editors appear in the product layer, outside the authored CSS.

- `jv-value` attribute on progress/meter: bind the numeric value property.
- `jv-attr-<attribute>`: read a scalar into an allowed attribute: title, aria-label, aria-valuenow, aria-valuetext, x/y/cx/cy/x1/x2/y1/y2/width/height/r/rx/ry/fill/stroke/opacity. URLs are not permitted in attributes.

Repeat aliases use ordinary path suffixes (`task.title`, `task['odd.key']`); nested repeats can reference outer aliases. Keys must be unique strings or finite numbers. Unkeyed arrays can display/edit against an unchanged acknowledged document, but have no stable row identity across reorder.

Edits that began before another accepted source change are refused rather than redirected to a different record. Exact numeric source spelling and unsafe edit restrictions are retained.
