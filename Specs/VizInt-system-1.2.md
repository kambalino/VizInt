# 🚀 VizInt System Specification (v1.2)

This document unifies and supersedes the previous **VizInt-Gadgets.md** and **VizInt-Portal-1.1.md** specs into a single, structured reference for the entire VizInt platform.

**Sections:**

1. VizInt System Architecture
2. Portal System Specification
3. Gadget API v1.1

_## 1. VizInt System Architecture

The VizInt platform consists of four coordinated layers, each with clearly defined responsibilities and communication pathways.

### **1.1 Portal Layer (Core Engine)**

The central orchestration system responsible for:

* Gadget discovery, registration, and multi-instantiation
* Shared library loading and lifecycle
* Storage management (namespaced, ring‑fenced, portable)
* System settings & environment state
* Inter-gadget messaging and notifications
* Crash recovery, reset flows

### **1.2 Shared Libraries Layer (System Services)**

Shared libraries are system-level services exposed to gadgets via `ctx.shared`. There are **two categories**:

#### 1.2.1 Implicit Runtime Services (Always Present)

These are part of the core VizInt runtime and are **always available** to every gadget instance, regardless of its declared capabilities:

* `ctx.shared.Nexus`

  * Event bus for portal ↔ gadget ↔ gadget messaging
  * Used for notifications, ticker routing, cross-gadget signals, and control messages

* `ctx.shared.Vault`

  * Backing implementation for `ctx.storage`
  * Handles namespaced, ring-fenced storage and abstracts over localStorage / future backends

These services are **imposed by the Portal** and should be treated as part of the baseline environment (like the DOM), not optional helpers.

#### 1.2.2 Capability-Driven Services (Opt-in Extensions)

These services are only guaranteed when a gadget explicitly declares the corresponding capability in its manifest. The Portal uses `capabilities` to decide which helpers to wire up, warm, or permission-check.

* Capability: `"chronus"` → `ctx.shared.Chronus`

  * Time/date/timezone helpers, end-of-month calculations, relative offsets, etc.

* Capability: `"atlas"` → `ctx.shared.Atlas`

  * Geo resolution (IP + device), best-geo resolver, `{lat, lng, country, source}` helpers.

* Capability: `"network"`

  * Signals that the gadget will talk to remote APIs.
  * May map to a future `ctx.shared.Network` helper for fetch wrappers / offline-aware semantics.

* Capability: `"served"`

  * Marker that the gadget MUST be run from `http://` or `https://` and is not supported on `file://` origins.
  * This is a **constraint flag**, not a library.

The **contract** is:

* If a capability is declared, the matching helper (e.g. `ctx.shared.Chronus`) will be present and ready.
* Gadgets SHOULD only consume capability-driven helpers they have declared, plus the universal runtime services (`Nexus`, `Vault`).

### **1.3 Chrome / UX Layer**

*

The visual and interaction framework of the portal:

* Gadget chrome (titlebar, handles, gear, info button)
* Ticker tape and toast notifications
* Themes (Light, Dark, Sticky‑Note, Dynamic, System)
* Drag/reposition support
* Grid layout & multi‑height support

### **1.4 Gadget Layer (User-Facing Components)**

Self‑contained modules that:

* Implement the `manifest` and lifecycle (`mount`, `unmount`)
* Declare capabilities (chronus, atlas, network, served)
* Consume shared libraries & storage via `ctx`
* Provide features directly to the user
* Support multi-instance when enabled

Gadgets never load shared libraries themselves and never directly modify storage outside their namespace.

---

## 2. Portal System Specification

This section defines what the **Portal** guarantees to all gadgets and shared libraries. It merges and formalizes the content of the former `VizInt-Portal-1.1.md` into a coherent contract.

### 2.1 Ownership & Channels

* **Owner Channel:** `VizInt Portal`
* **Collaborating Channels:**

  * `VizInt project planning` — prioritization, roadmap, and cross-cutting decisions
  * `Chronus design updates` — consumers of Chronus/Atlas once shared libs are in place
  * `Improve VizInt UX` — chrome, themes, drag/reposition, ticker/toast visuals
  * `Generic Plug-in Design` — reference gadgets and multi-instance skeletons

### 2.2 Core Responsibilities

The Portal is responsible for:

* Discovering available gadgets
* Creating and destroying gadget instances
* Providing a consistent **`ctx` object** to every gadget
* Loading and wiring shared libraries (Chronus, Atlas, Nexus, Vault, etc.)
* Managing namespaced storage and import/export flows
* Handling notifications (toasts, ticker) at the infrastructure level
* Providing global and per-session reset mechanisms

### 2.3 Requirements (A-Series)

> Numbering follows the existing BASIC-style increments from the A-series in the original portal spec.

#### **A10 — SUPPORT gadget instantiation from dynamic registry**

**Priority:** P0
The Portal MUST support enabling, disabling, and instantiating gadgets from a dynamic registry:

* Allow **multiple instances** for gadgets marked `instantiable` in their manifest
* Maintain independent settings per instance
* Ensure consistent mount/unmount lifecycle and ID tracking (e.g. `Clock:Local`, `Clock:London`)

---

#### **A11 — PROVIDE uniform shared library access**

**Priority:** P0
The Portal MUST expose shared libraries via `ctx.shared` for all gadgets:

* e.g., `ctx.shared.Chronus`, `ctx.shared.Atlas`, `ctx.shared.Nexus`, `ctx.shared.Vault`
* Gadgets MUST NOT import these modules directly or re-implement their logic
* Shared libraries MUST be initialized once by the Portal before any gadget mounts

---

#### **A12 — DEFINE standard component loader protocol**

**Priority:** P0
The Portal MUST own script loading and dependency management:

* Provide a standard mechanism (e.g. internal `loadSharedOnce()` / `loadGadgetOnce()`) that guarantees single-load semantics
* Ensure load order: shared libs → history → loader → gadgets
* Prevent gadgets from individually creating duplicate `<script>` tags for shared libs

---

#### **A13 — AUDIT gadgets for redundant definitions**

**Priority:** P0
The Portal workstream MUST include a hygiene phase:

* Identify duplicated code across gadgets (geo, time math, loaders, storage helpers)
* Migrate those utilities into shared libs under `ctx.shared`
* Replace in-gadget implementations with calls to the unified helpers

---

#### **A14 — IMPLEMENT Notification Hub (Toasts, Ticker Tape)**

**Priority:** P1
The Portal MUST provide a central notification service (internally built on Nexus):

* Ticker tape API for `{title, content, rotations, rotationInterval, windowFrom, windowTo}`
* Toast API for short-lived, non-blocking messages
* Mechanism for gadgets to request icon flashing or highlighting when they originate a notification

(Visual rendering of ticker and toasts resides in the **Chrome/UX** workstream; the Portal defines the API and routing.)

---

#### **A15 — ESTABLISH Atlas subsystem for geo-services**

**Priority:** P0
Atlas MUST be the exclusive provider of geo-related functionality:

* Integrate IP-based fallback and browser geolocation logic
* Expose a standard shape `{lat, lng, country, source}`
* Handle permission probing (e.g., do not prompt when running on `file://`)
* Provide deterministic fallback locations when geo cannot be resolved

All gadgets requiring location MUST go through `ctx.shared.Atlas`.

---

#### **A16 — REFACTOR LocalStorage into managed namespaces**

**Priority:** P0
The Portal MUST prevent gadgets from free-form localStorage access:

* Assign each gadget (and instance) a unique namespace
* Forbid direct access to `window.localStorage` in gadget guidelines
* Route all reads/writes through `ctx.storage` (backed by Vault)
* Ensure the portal’s own settings (dock layout, theme, registry preferences) live in a separate, protected namespace

---

#### **A17 — BUILD Storage Manager UI**

**Priority:** P0
The Portal MUST expose a **Storage Manager** view (likely via a dedicated gadget):

* Show total storage use and per-gadget/instance breakdown
* Allow browsing and deleting keys per silo
* Support export/import of gadget silos to portable JSON
* Offer a global "nuke from orbit" option to wipe all state

---

#### **A18 — IMPLEMENT crash-recovery page (reset.html)**

**Priority:** P1
The Portal MUST provide an out-of-band recovery page:

* `reset.html` that can be opened independently when the main portal is broken
* Controls to clear all data or selectively reset individual silos (per gadget/instance)

---

#### **A19 — ADD version history timestamps**

**Priority:** P1
The Portal MUST include dates in the version history:

* Update `history.js` entries to include `(YYYY-MM-DD)` or similar next to the `#NNN` version tag
* Ensure the header gadget can display this nicely

---

#### **A20 — ENABLE dynamic registry discovery**

**Priority:** P1
The Portal MUST replace hardcoded gadget lists with a dynamic registry:

* Maintain a persisted gadget library of known gadgets
* Support scanning the `/gadgets/` folder (or configured URLs) to discover new gadgets
* Provide UI to enable/disable gadgets from that library

---

#### **A21 — DEFINE full portal-level settings**

**Priority:** P1
The Portal MUST provide a centralized settings surface including:

* Refresh cadence / auto-refresh strategies
* Import/export of **portal** settings (separate from gadget silos)
* Theme selection: `Light`, `Dark`, `Dynamic (sunrise/sunset)`, `Follow-system`
* Opt-in toggle for fine-grained geolocation
* A "trash" or "factory reset" control to clear portal-level state

---

---

_
