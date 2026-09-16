# Security

Report a vulnerability involving data loss, cross-file writes, code execution, or access outside a CLI session through [GitHub private vulnerability reporting](https://github.com/script-it/json-views/security/advisories/new). Please do not open a public issue for it.

Include the package version, Node/browser version, expected behavior, a minimal synthetic JSON document, and reproduction steps. Do not include session tokens, private file contents, or credentials.

The CLI token grants access to the one file selected at startup. Treat the printed URL as a local capability. The CLI binds to loopback, checks origin and host headers, and restricts API writes to valid JSON with a matching revision. See [Local file and agent API](packages/cli/README.md#local-file-and-agent-api) for filesystem concurrency limits.

Annotations are untrusted data; registry callbacks and custom React widgets are trusted application code. Patterns use RE2JS. JSON source is preserved separately from JavaScript inspection values. The package does not sanitize arbitrary host-provided Markdown renderers or custom widget code; hosts own those extension boundaries.
