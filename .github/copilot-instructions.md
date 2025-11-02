## Purpose
Quick instructions for coding agents to be productive in the VizInt (Portal) repo.

## Big picture (how the app is organized)
- This is a tiny, file://-friendly gadget portal (no bundler). Key host is `index.html` which loads a set of global libs from `/lib` and registers a gadget catalog from `lib/registry.js`.
- Gadgets live in `/gadgets/*.js` and expose APIs on the global `window.GADGETS` object. Each gadget typically exports an object like `{ mount(host, ctx){...}, info?:string, onInfoClick?:fn }`.
- The loader (UI chrome, state, and mounting) is implemented in `lib/loader.js`. It drives rendering by reading settings (localStorage key `'portalSettings'`) and calling `Registry.loadGadget(name)`.
- The Registry (`lib/registry.js`) provides `window.REGISTRY.GADGETS`, `PATHS`, `GADGET_CATALOG` and `loadGadget(name)` which dynamically injects gadget scripts and resolves `window.GADGETS[name]`.
- Chronus (time anchoring/pubsub) is a small core in `lib/chronus.js`. Providers register via `Chronus.registerProvider({ name, provide })` (async provide returns anchors).

## Important global contracts & constants
- window.REGISTRY — gadget list + loader helper (see `lib/registry.js`).
- window.GADGETS — gadget implementations live here after load (or built-in ones like `header`).
- window.Portal — API exported by the loader: `render`, `getSettings`, `setSettings`, etc. (`lib/loader.js`).
- window.Chronus — pub/sub & provider API for time anchors (`lib/chronus.js`).
- window.VIZINT_VERSION and window.VIZINT_HISTORY — version & history maintained by `scripts/version-bump.js` which writes `lib/history.js`.

## Gadget conventions (concrete examples)
- Define your gadget file to set `window.GADGETS.<id> = { mount }`. Example: `gadgets/eom.js` uses `window.GADGETS.eom = { mount }` and returns an unmount function.
- mount(host, ctx) signature: host is a DOM node, ctx contains `{ settings, setSettings, bus (window), gadgetCatalog, getSettings }` (see `lib/loader.js`).
- If your gadget needs to be loaded dynamically, include it in `registry.js` with `id` and `path`, and ensure it exposes `mount` after load.
- Info string & onInfoClick: provide `info: 'short description'` and optionally `onInfoClick(ctx, refs)` to populate the ℹ️ UI.

## Chronus provider pattern
- Providers return time anchors via an async `provide({ context, frame, cursor })` method and register with `window.Chronus.registerProvider(provider)`; see `providers/prayerTimesProvider.js` for a concrete example.

## State & persistence
- Portal settings are persisted to localStorage under `portalSettings`. Use `getSettings()` / `setSettings()` from the ctx to read/update reliably.
- `settings.enabledGadgets` is the canonical order/enabled list. The loader ensures `header` (start) and `settings` (end) are present.

## Developer workflows & commands
- No build step required; files are loaded directly by `index.html` (file:// friendly). Edit JS/HTML and reload the page.
- To bump a version/tag and update `lib/history.js`, run the node script from the repo root: `node scripts/version-bump.js` (requires Git available & tags). This script updates `lib/history.js` and attempts to create a `ver-###` tag.

## Patterns to avoid / gotchas
- Code expects globals — avoid ES module syntax unless you also update `index.html` loader order. Keep file:// compatibility when possible.
- Registry paths are used by `loadGadget`; if a gadget uses external libs or needs timezone-aware dates, prefer Intl APIs (see comment in `providers/prayerTimesProvider.js`).
- Gadgets must return a cleanup/unmount function from `mount` when they set intervals/listeners.

## Files to read for examples
- `lib/loader.js` — main UI mounting, chrome, settings flow
- `lib/registry.js` — gadget catalog and dynamic loader
- `lib/chronus.js` — time anchoring + provider api
- `gadgets/settings.js`, `gadgets/eom.js`, `providers/prayerTimesProvider.js` — concrete gadget and provider examples
- `scripts/version-bump.js` — repo tagging/version flow

## If you are an AI assistant: practical tips
- Use `window.REGISTRY.loadGadget(name)` to simulate loading a gadget; expect it to inject a `<script>` tag and resolve `window.GADGETS[name]`.
- When adding a new gadget, add an entry to `lib/registry.js` (id + path) and implement `window.GADGETS.<id>` in the file.
- Preserve the localStorage key format and existing settings shape to avoid corrupting user state.
- Keep edits small and file:// friendly; test by reloading `index.html` in the browser.

---
If anything here is unclear or you want the file expanded with more examples (e.g., a gadget template or Chronus provider template), tell me what to include and I'll iterate.
