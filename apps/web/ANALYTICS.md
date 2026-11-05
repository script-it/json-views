# Website analytics

Events use the existing RudderStack client and analytics preference. The CLI and published packages do not send these events. Each page load has an ephemeral anonymous ID; no visitor ID is persisted.

- `json_views_page_viewed`: existing entry/interface fields plus `referrer_domain` (hostname only) and approved `utm_source`, `utm_medium`, `utm_campaign`, and `utm_content` values.
- `json_views_link_clicked`: `link_id=agent-guide` or `link_id=template-navigation`; template navigation also includes `template_id`.
- `json_views_document_opened`: template navigation uses `method=navigation` and includes the built-in `template_id`.
- Existing document events include `template_id` when the document originated from a bundled template in this page load.
- `json_views_view_selected`: `template_id`, `view_id`, and `interface=ui`, on initial display or changes to the active built-in document/view. Unknown/custom views are omitted.

The old landing-page agent buttons, example cards, and Read More link are absent from the current website source. Current navigation controls are instrumented instead. There is no agent-specific button to report yet.

Approved campaign values are defined in `src/analytics.ts` (`APPROVED_CAMPAIGNS`). Add reviewed campaign labels there before using new marketing links. Arbitrary values, `utm_term`, full URLs, paths, fragments, and query parameters outside this list are not sent.

Built-in identities and view IDs are explicitly listed in `src/analytics-builtins.ts`. Only documents loaded by the bundled-example loader receive provenance; uploaded documents cannot acquire it by matching a filename or ID. Edits retain the original fixed template identity during that page load. Edited documents restored from browser storage are treated as user documents and do not receive template/view identities. User filenames, custom view names, and document content are never used as analytics labels.

Before releasing, validate a permitted campaign visit, template/view navigation, and opt-out in RudderStack, then confirm the new events/properties arrive in BigQuery and Mixpanel. Local tests verify payload filtering and opt-out; they do not establish live destination delivery.
