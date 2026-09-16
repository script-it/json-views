# Packed consumer fixture

`scripts/test-packages.mjs` copies this project to a temporary directory, adds dependencies on local npm tarballs, and installs it independently of the monorepo. It first tests a production-only install, then installs development tools for a strict NodeNext declaration check and a Vite production bundle. No source aliases or workspace symlinks are used.

After building the repository, run `node scripts/test-packages.mjs`. This installs public npm dependencies and starts a loopback CLI server against a disposable JSON file. Nothing is published. Set `JSON_VIEWS_CONSUMER_REACT_MAJOR=18` to exercise the React 18 support contract (the default is React 19). Set `JSON_VIEWS_KEEP_CONSUMER=1` to retain the temporary project for inspection after a run.


The browser fixture embeds two independent viewers with explicit light/dark themes. The surrounding host owns generic CSS variables and utility-like class names. Each viewer exposes a select menu and date picker for portal checks, a read-only toggle, an inspectable source snapshot, and a custom `coordinate` type whose persisted object is converted to and from an editable `x, y` string.

To inspect it interactively, retain the installed consumer, then start Vite from the printed temporary consumer directory:

```bash
JSON_VIEWS_KEEP_CONSUMER=1 node scripts/test-packages.mjs
cd /path/printed/by/the/test/consumer
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4300
```

The app runs at `http://127.0.0.1:4300/`. Editing either document must not change the other document's source or the host button. Popups must use their originating viewer's theme even when both themes are present. The native import, SSR, and CLI tests remain separate from these interactive embedding checks.
