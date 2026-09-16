# @script-it/json-views

Open one local JSON file in the browser:

```sh
npx @script-it/json-views ./data.json
```

Use `--no-open` to print the URL for another client. The local server binds to loopback, requires its session token, and exposes only the selected file. Source saves preserve the exact text, including invalid JSON; structured views return once the source is valid.

Uploads create a separate browser-only document. Source saves and formatting are explicit. Concurrent API writes are serialized with revision checks; unrelated processes that do not cooperate with the server are not covered by an atomic filesystem compare-and-swap guarantee.

See [Local file and agent API](#local-file-and-agent-api) below. Requires Node 22.13+ in the 22.x line or Node 24+. MIT.

## Local file and agent API

In the browser host, `window.jsonViews.diagnostics(documentId)` and WebMCP `json_views_get_diagnostics` return structured issues with exact annotation/data paths and `help` (repair, expected shape, received preview, examples, and relevant capabilities). Browser writes return the same diagnostics. `list()` stays compact; request `includeDiagnosticCount` only when needed. The filesystem HTTP endpoint below returns source snapshots and revisions; it does not return annotation diagnostics.

`valid` describes source syntax, not an absence of annotation/value errors: always inspect `diagnostics`. Complete source writes preserve any text; malformed JSON is saved with `valid: false` and source diagnostics. Invalid RFC 6902 patches are rejected before mutation. Other failures (such as missing documents or persistence errors) remain tool errors and must not be interpreted as successful writes.

Run the CLI without opening a system browser:

```bash
json-views ./data.json --no-open
```

It prints a random session URL and an API endpoint. The endpoint accepts:

- `GET /api/document?token=...` — returns `{ content, filename, revision }`, preserving the source exactly. Invalid JSON can be opened for repair.
- `PUT /api/document?token=...` — accepts `{ content, revision }` with `Content-Type: application/json`, preserves any source text (including invalid JSON), and returns the exact accepted snapshot and its new revision.

Revisions are SHA-256 hashes of source text, including whitespace. An unchanged save skips the write. A stale revision receives HTTP `409`; the browser retains the unsaved draft for repair, retry, or download. Reloading a local file retains the previous unsaved draft as a downloadable recovery copy.

Every compare/write/acknowledge operation is serialized per resolved destination within the CLI process, including separate servers in that process. Among concurrent writes with the same starting revision and different new content, exactly one can succeed. The response describes that operation's accepted content, even if another operation subsequently saves a newer revision.

**External writer boundary:** changes already on disk when the revision check runs are detected. Atomic rename prevents readers from observing a partially written file. It is not an operating-system compare-and-swap: another editor or another CLI process can write between the revision check and rename, and those unrelated writers do not participate in the queue. Use one writing CLI process for a file and coordinate external edits; this API does not promise cross-process locking.

Security and filesystem behavior:

- The command listens on `127.0.0.1`, never all interfaces, and rejects unexpected Host headers.
- Only the explicit command-line file is exposed by the document API.
- Requests require a 192-bit random token. Cross-origin browser requests are rejected; non-browser callers may omit Origin.
- Invalid request JSON or invalid document JSON receives `400`, stale revisions `409`, unsupported request content types `415`, and request bodies larger than 20 MB `413`.
- Source is never parsed and stringified for storage. Numeric spelling, duplicate object keys, whitespace, and trailing newlines survive unchanged unless explicitly edited or formatted.
- Writes create an exclusive temporary file in the same directory, flush it, apply the original ownership and permission bits, then atomically rename it. Explicit chmod preserves mode regardless of umask. If ownership cannot be preserved on POSIX, the write fails and the original stays intact. ACLs, extended attributes, hard-link identity, and crash durability of the containing directory are not guaranteed by replacement.
- A command-line symlink is resolved once at startup; saves replace its target and preserve the link. If the link is later retargeted, the session still refers to the original target path.
- Static assets cannot follow symlinks outside the public directory. Responses use a restrictive Content Security Policy and `Referrer-Policy: no-referrer`.

Uploading a file in the browser starts a separate, tab-local document and detaches the local-file capability. The uploaded file cannot overwrite the originally opened CLI file. Source editing preserves invalid drafts; **Format** changes only whitespace and **Save to file** explicitly persists valid source. Visual edits save immediately. Tab-local documents use **Apply source** and **Download**.

The session URL is a capability. Do not share it with untrusted software while the CLI is running. This is a local development tool, not an authenticated network service.
