# 🌭 VizInt Requirements Specification (v1.0 Draft)

> Comprehensive technical and design requirements for the VizInt modular portal ecosystem.
> Numbering follows BASIC-style increments (10, 11, 12…) for easy future expansion.

---

## A. Portal Core & Infrastructure

**Owner:** Portal Core Channel
**Scope:** Instantiation, shared library loading, storage management policies, registry, reset flows.

---

**Priority:** P0

### 10 SUPPORT gadget instantiation from dynamic registry

Enable gadget instantiation (single or multiple instances) through the portal’s library.
Portal must manage each instance’s independent settings and mount lifecycle, ensuring gadgets can be dynamically added or removed without collision.

---

**Priority:** P0

### 11 PROVIDE uniform shared library access

All gadgets should import utilities like `shared.js` (Chronus/Atlas/httpSafe/etc.) through a consistent access mechanism (`ctx.shared`), eliminating re-implementation of helpers in individual gadgets.

---

**Priority:** P0

### 12 DEFINE standard component loader protocol

Introduce a formal method (potentially via `.h` or `ctx.require`) to include shared components only once.
Guarantee that each gadget’s IIFE sees globally available helpers without redundant network requests or symbol conflicts.

---

**Priority:** P0

### 13 AUDIT gadgets for redundant definitions

Conduct a repository-wide audit for duplicate logic (geo fetchers, time formatters, loaders).
Replace redundant code with unified helpers in `shared.js` or specialized sub-modules (`Chronus`, `Atlas`, etc.).

---

**Priority:** P1

### 14 IMPLEMENT Notification Hub (Toasts, Ticker Tape)

Centralized notification system publishing:

* Ticker tape banner supporting `{Title | Content}` items
* Controls for number of rotations, rotation frequency, and publication window (from/to)
* Flashing gadget icons when notifications originate from that gadget.

---

**Priority:** P0

### 15 ESTABLISH Atlas subsystem for geo-services

Atlas must unify all location functionality, including:

* Fine-grained browser-based geolocation (optional, off by default)
* IP-based fallback
* Deterministic “best-geo” resolver
* Standard data structure `{lat, lng, country, source}` shared by all gadgets.

---

**Priority:** P0

### 16 REFACTOR LocalStorage into managed namespaces

Replace ad-hoc gadget storage with a central manager.
Rules:
a. Namespaced per gadget
b. Ring-fenced from portal/global store
c. No cross-gadget tampering
d. Data sharing only through explicit APIs/contracts.

---

**Priority:** P0

### 17 BUILD Storage Manager UI

Expose:

* Total consumed quota
* Per-namespace usage
* Browse, view, delete data per gadget
* Import/export feature for migration across devices
* Optional sync to authenticated online “bit-bucket” (if file:// constraints allow)
* Wrapper re-targetable to other storage backends (e.g., IndexedDB, local files).

---

**Priority:** P1

### 18 IMPLEMENT crash-recovery page (reset.html)

Standalone page to clear all local contexts safely.
Must allow selective reset (per gadget or global) to recover from corrupted settings.

---

**Priority:** P1

### 19 ADD version history timestamps

Every entry in `history.js` should include the commit date/time alongside its version tag (e.g., `#016 (2025-11-10)`).

---

**Priority:** P1

### 20 ENABLE dynamic registry discovery

Replace hard-coded registry list with:

* Persistent gadget library
* Auto-scanning of available files or URL sources
* Ability to enable/disable gadgets from this dynamic list.

---

**Priority:** P1

### 21 DEFINE full portal-level settings

Comprehensive settings panel including:

* Forced refresh intervals
* Import/export of all portal settings
* Theme selection: Light / Dark / Dynamic (sunrise/sunset) / Follow-system (default)
* Enable/disable fine-grained geo access
* “Empty trash” control to clear all local state.

---

## B. Chrome / UX & Notifications

**Owner:** Improve VizInt UX Channel
**Scope:** Visual framework, titlebar, theme system, notification display, drag/reposition.

---

**Priority:** P0

### 30 REFACTOR titlebar chrome

Add multi-functional widgets:

* Info icon (hover = summary, click = signal gadget)
* Settings gear (hover = quick menu, click = full settings)
* Built-in ticker tape for rotating notifications.

---

**Priority:** P1

### 31 SUPPORT multiple themes (Sticky-Note, etc.)

Extend theme engine to include special visual modes beyond dark/light.
Themes should be selectable and persisted per user preference.

---

**Priority:** P1

### 32 SUPPORT double-height gadgets

Allow taller gadgets that occupy two grid rows, respecting responsive layouts.

---

**Priority:** P1

### 33 VISUAL state indicators for active/minimized gadgets

Minimized gadgets should appear visually depressed or dimmed.
Icons or borders should reflect their current state.

---

**Priority:** P0

### 34 ENABLE drag-and-drop repositioning

Add grab handles (2×3 dot grid) for reordering gadgets within the grid.
Persist order in local settings.

---

**Priority:** P1

### 35 CONSOLIDATE CSS catalogue

Audit existing styles and inline CSS across all gadgets.
Converge on a minimal, documented set of shared classes and variables.

---

**Priority:** P1

### 36 CONSOLIDATE notifications into chrome layer

Ticker tape and toast messages should visually integrate with the main title gadget.
Maintain a session-only history viewer for ticker messages.

---

## C. Gadget Authoring & Semantics

**Owner:** Generic VizInt Gadget API Discussions Channel
**Scope:** Developer language, manifest schema, user interactions, communication protocols.

---

**Priority:** P0

### 50 ENABLE multi-instance gadget support

Gadgets must define whether they are `singleton` or `instantiable`.
Portal spawns independent instances with isolated `ctx` and persistent settings.

---

**Priority:** P0

### 51 DEFINE interaction semantics

Create a reference chart mapping gestures to meanings:

* Hover = quick info
* Click = action/expand
* Gear = settings
* Info hover = details
* Verbose flag toggles expanded mode.

---

**Priority:** P1

### 52 SUPPORT verbosity & diagnostics modes

Allow gadgets to toggle verbose view (showing extended data, e.g., coordinates, methods).
Optional diagnostics output for debugging via console or side panel.

---

**Priority:** P1

### 53 DEFINE communication channels

Standardize message types and destinations:

* Gadget viewport (normal display)
* Toast (brief message)
* Popup (blocking configuration)
* Ticker tape (non-blocking notifications).
  Browser alerts are prohibited.

---

**Priority:** P1

### 54 SUPPORT “clear context” reset per gadget

Expose a standardized way for gadgets to fully reset their internal state (e.g., via hover menu > “Reset Context”).

---

## D. Shared Libraries & System Services

**Owner:** Chronus design updates Channel
**Scope:** Shared code ecosystem (Chronus, Atlas, Nexus, Vault, Librarium, etc.).

---

**Priority:** P0

### 70 ESTABLISH modular shared-library architecture

Define clear namespaces (`Chronus`, `Atlas`, `Nexus`, `Vault`) accessible through `ctx.shared`.
Libraries must self-register and avoid polluting global scope.

---

**Priority:** P0

### 71 ENFORCE single-load policy

If a shared library is loaded via index.html, all gadget IIFEs must detect and reuse it instead of re-loading.

---

**Priority:** P1

### 72 SPECIFY load-order guarantees

Establish initialization sequence ensuring libraries are available before gadget mounting.
Index.html → Shared libs → History → Loader → Gadgets.

---

**Priority:** P1

### 73 SUPPORT inter-library dependency resolution

Shared libs should declare dependencies (e.g., Atlas depends on Chronus).
Loader ensures proper chaining without circular imports.

---

**Priority:** P1

### 74 EXTEND shared.js into modular services

Split current monolith into dedicated files for:

* httpSafe/network helpers
* Geo services (Atlas)
* Timezone and formatting (Chronus)
* Event bus (Nexus)
* Storage interface (Vault).

---

## E. Storage & Persistence Manager

**Owner:** VizInt Storage Manager Channel
**Scope:** Storage architecture, isolation, migration, visualization.

---

**Priority:** P0

### 90 IMPLEMENT unified storage API

Expose `ctx.storage = {get,set,remove,clear,list}` per gadget.
Internally backed by namespaced localStorage, interchangeable with future backends.

---

**Priority:** P0

### 91 BUILD visualization dashboard

UI to display total storage, per-gadget usage, and remaining quota.
Enable purge, inspect, and export functions.

---

**Priority:** P1

### 92 SUPPORT import/export of gadget silos

Allow backup/restore of gadget data to JSON files.
Support selective import to avoid overwriting unrelated contexts.

---

**Priority:** P1

### 93 ENABLE backend migration

Transparent layer enabling migration between storage systems (localStorage ↔ IndexedDB ↔ Cloud bucket).

---

**Priority:** P2

### 94 SUPPORT authenticated remote sync

Optional integration with OAuth-based providers (GitHub, Google).
Offline-first design; gracefully degrade for `file://` users.

---

## 🧩 Appendix: Notes on JavaScript Load Order

* **Yes**, if a JS file is loaded from `index.html`, its globals are visible to all gadget IIFEs loaded afterward (due to single page/global scope).
* **Yes**, load order matters. Scripts must be loaded in dependency order (shared libs first).
* **No**, you cannot invoke a function that hasn’t been declared or loaded yet. You can, however, **defer** calls (e.g., via `DOMContentLoaded`, `await loadScriptOnce()`, or event dispatch) until the symbol exists.

---

*End of document*
*(Draft prepared for VizInt planning consolidation — 2025-11-13)*
