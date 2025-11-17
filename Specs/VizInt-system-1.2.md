# VizInt System Specification – v1.2

*(Complete, canonical, architecture-level specification for the VizInt Platform. Mixed normative language applied: MUST / SHOULD / MAY.)*

---

# 0. Purpose of this Document

This **System Specification** defines the *architecture*, *shared libraries*, *capabilities model*, *storage doctrine*, *IPC/event model*, *layout framework*, and *gadget contract* used across the entire VizInt ecosystem.

It serves as the **top-level reference** for all subsystem prompts, FRTP cycles, and downstream component specifications (Portal Spec, Gadget Authoring Spec, Chronus Spec, Atlas Spec, etc.).

This spec **does not** define portal chrome, badge visuals, or gadget UI-specific rules — those reside in **Portal Spec** and **Gadget Authoring Spec**.

---

# 1. System Overview

VizInt is a client-side modular dashboard system supporting:

* Multi-gadget execution
* Uniform shared libraries (`ctx.libs`)
* Dynamic instancing & per-instance settings
* Strong storage isolation
* A universal cross-gadget event bus
* Standardized gadget manifests
* Mixed human/AI team collaboration through FRTP

Guiding principles:

* **Isolation**: Gadgets MUST NOT interfere with each other.
* **Predictability**: Load order, shared libs, and capabilities MUST behave consistently.
* **Extensibility**: Shared libraries MUST grow without breaking existing gadgets.
* **Replaceability**: Gadgets SHOULD NOT depend on unspecified runtime side effects.
* **Transparency**: Settings MUST be clearly partitioned and accessible.
* **Protocol Discipline**: All cross-stream communication follows Volk/FRTP.

---

# 2. Shared Library Layer (`ctx.libs`)

Gadgets receive shared system libraries through:

```js
const { Core, Chronus, Atlas, Nexus } = ctx.libs;
```

These MUST be preloaded and ready by the time `mount()` is called.

## 2.1 Library List

### **2.1.1 Core (Expanded Core, v1.2)**

Core MUST provide:

* Pure helper utilities
* String helpers
* Math helpers
* Date helpers (non-chronus-specific)
* DOM helpers
* Event helpers
* Formatting utilities
* Parsing helpers
* Validation helpers
* Layout helpers (geometry classification)

**Backlog:** Split into `Core` + `ExtendedCore` in v1.3+, co-owned by U:Portal & U:Orchestrator.

### **2.1.2 Chronus**

Provides:

* Time calculations
* DST adjustment
* Time zone logic
* PrayerTime providers (through Chronus provider architecture)

Chronus MUST NOT depend on Atlas but MAY accept Atlas objects as parameters.

### **2.1.3 Atlas**

Provides:

* Geo lookup
* City metadata
* Fine-grain geolocation when allowed
* Geo fallback & best-guess logic
* Canonical Location objects

### **2.1.4 Nexus**

The system coordination hub. Nexus MUST provide:

* **Global event bus**
* **Ticker wiring**
* **Future modal orchestration**

Nexus MUST automatically inject:

* `from: ctx.name`
* `ts: Date.now()`

Gadgets MUST NOT override `from`.

Canonical message envelope:

```js
{
  from: "Vz:Clock:Local", // auto
  to: "Vz:Other:Instance" | null, // null → Portal
  ts: 1234567890,
  channel: "ticker" | "custom" | null,
  level: "info" | "warn" | "error" | undefined,
  data: { /* freeform */ }
}
```

---

# 3. Capability Model

Capabilities express *intent*, not entitlement.

Valid capabilities:

* `chronus`
* `atlas`
* `network`
* `served`

## 3.1 Semantics

* Portal MUST preload Chronus & Atlas for all gadgets.
* Capabilities SHOULD determine UI badges.
* The `served` capability MUST trigger a ⚠ warning on `file:///`.
* Gadgets MUST still mount on `file:///` even if they request `served`.

---

# 4. Storage & Settings Doctrine

Gadgets MUST NOT know or manipulate storage keys.

Portal MUST expose a wrapper:

```js
ctx.getSettings(key, defaultValue)
ctx.setSettings(patch)
ctx.resetSettings() // clears this instance only
```

Storage MUST be transparently mapped to:

```
Vz:<Class>:<Instance>
```

Storage MUST be:

* Per-instance by default
* Per-class for bulk deletion
* Sync for v1.2

Writes SHOULD be debounced (≥ 100ms).

Ephemeral UI state MUST NOT be persisted.

Gadgets MUST NOT call setSettings() inside mount().

---

# 5. Gadget API (Conceptual Contract)

Every gadget MUST define a manifest containing:

* `_api: "1.0"`
* `_class`
* `_type: "singleton" | "instantiable"`
* `_id`
* `_ver`
* `label`
* `description`
* `capabilities`
* `supportsSettings` (optional)

Canonical name:

```
Vz:<Class>:<Instance>
```

## 5.1 Mount Contract

Gadgets MUST implement:

```js
export function mount(host, ctx) { ... }
```

Where:

* `host` is the viewport container
* `ctx` includes:

  * `name`
  * `host`
  * `env`
  * `libs` (Core, Chronus, Atlas, Nexus)
  * `getSettings`
  * `setSettings`
  * `resetSettings`

Gadgets MUST NOT manipulate portal chrome.

Gadgets MAY use Shadow DOM or scoped CSS.

---

# 6. Global Event Model (Nexus)

## 6.1 Bus

Nexus MUST expose:

```js
bus.emit(channel, payload)
bus.on(channel, handler)
```

Channels MUST be namespaced for inter-gadget messages.

## 6.2 Ticker

* Uses `channel: "ticker"` and `level`
* MUST be session-only
* MUST route through Nexus

## 6.3 Future Modals

Future versions MAY add modal orchestration through Nexus.

---

# 7. Layout & Geometry Framework

Portal MUST expose geometry metadata:

```js
ctx.env.geometry = { cols: n, rows: m }
```

Core MUST expose:

```js
Core.Layout.classify(geometry)
```

This MUST return:

```js
{
  category: "square" | "wide" | "tall" | "large",
  flags: {
    isMultiCol: boolean,
    colSpan: number
  }
}
```

Gadgets SHOULD adjust rendering based on category but MUST remain functional under all categories.

---

# 8. Versioning Model

* System Spec: **v1.2**
* Portal Spec: **v1.2**
* Gadget API: **1.0** (stable for this cycle)

Versioning MUST be forward-compatible across minor cycles.

---

# 9. Workstream Roles (High-Level)

* **U:Architect** — Final authority over system design.
* **U:Orchestrator** — Spec stewardship, sequencing, cross-team alignment.
* **U:Portal** — Portal runtime owner.
* **U:Chronus** — Time/DST provider logic.
* **U:Atlas** — Geo provider logic.
* **U:UX** — Chrome, badges, layout specifics.
* **U:Gadgematix** — Gadget API guardian.
* **U:Factory** — Gadget migrations & refactoring.

---

# 10. Deprecated Concepts & Migration

## 10.1 `ctx.shared`

* MUST be treated as deprecated
* Portal MUST provide compatibility shim
* Usage MUST trigger console warning

## 10.2 Direct localStorage access

* Gadgets MUST NOT directly access localStorage
* Portal MAY warn when detecting it

## 10.3 Legacy Gadgets

Gadgets lacking `_api` MUST be treated as legacy and mounted best-effort.

---

# 11. System Lifecycle (Text Diagrams)

## 11.1 High-Level Timeline

```
Portal Boot
   ↓
Load shared libraries (Core, Chronus, Atlas, Nexus)
   ↓
Scan & register gadgets
   ↓
Resolve capabilities
   ↓
Inject ctx.libs
   ↓
Call mount(host, ctx)
   ↓
Gadget performs first render
   ↓
Gadget subscribes to bus (Nexus)
   ↓
Gadget steady-state execution
```

## 11.2 Sequence Diagram (ASCII)

```
Portal          Nexus          Gadget
  |               |               |
  |--load libs-->|               |
  |               |               |
  |--mount(ctx)-->|--inject bus-->|
  |               |               |
  |               |<--subscribe---|
  |               |               |
  |<----events--------------------|
  |               |               |
```

---

# END OF SYSTEM SPEC v1.2
