# VizInt Gadget Authoring Specification – v1.2

$VER: 1.2.2 (2025/12/01)

$HISTORY:

```
2025/12/01 1.2.2: Canonical registration updated to window.GADGETS[manifest._class] for all gadget types; clarified _ver semantics; expanded multi-instance conversion guidance (single→multi cookbook, new-gadget checklist).

2025/11/30 1.2.1: Changed _type enum to "single" | "multi" | "system"; deprecated "singleton" and "instantiable".

2025/11/22 1.2.0: Harmonized with System v1.2, Portal v1.2, Chronus v1.2, Atlas v1.2. Clarified manifest requirements, capabilities, ctx.libs usage, storage doctrine, GeoEnvelope consumption, and file:// policy.

2025/11/11 1.0.0: Initial Gadget API v1.0 spec (manifest, mount, basic capabilities).
```

---

## 0. Scope & Relationship to Other Specs

This document defines the **authoring contract** for gadgets in the VizInt v1.2 system.

It supersedes and refines the earlier Gadget API v1.0 document while keeping `_api: "1.0"` as the required manifest value.

It is consistent with:

* **System Spec v1.2** (architecture, capabilities model, storage doctrine)
* **Portal Spec v1.2** (manifest validation, ctx injection, file policy)
* **Atlas v1.2** and **Chronus v1.2** (GeoEnvelope semantics, time/anchor model)

Everything valid in v1.0 remains valid unless explicitly deprecated.

---

## 1. What Is a Gadget?

A VizInt gadget is a self-contained JavaScript module that:

* Registers itself: `window.GADGETS[<key>] = { manifest, mount, ... }`.
* Provides:

  * A manifest object with mandatory fields.
  * A `mount(host, ctx)` function.
* Runs entirely client-side (HTML/CSS/JS only).
* Must operate under `https://`, `http://`, and **`file://`**.

---

## 2. Lifecycle Overview

```
Discovery → Mount → Steady State → Unmount → Migration
```

Portal owns the lifecycle; gadgets operate within the container provided as `host`.

---

## 3. Manifest Schema (v1.2, API "1.0")

Every v1.2 gadget MUST define a `manifest` object.

### 3.1 Required Fields

```
const manifest = {
  _api: "1.0",              // Required gadget API version
  _class: "Clock",          // Gadget family (identity root; Portal normalizes it)
  _type: "single",          // "single" | "multi" for multi-instance gadgets | "system" for system gadgets (also singletons)
  _id: "Local",             // Internal variant identifier (author-defined, not the instance identity)
  _ver: "v0.1.0",           // Gadget code version (informational; Portal treats this as opaque text)
  label: "Clock (Local)",   // Display name
};
```

### 3.2 Recommended Fields

```
const manifest = {
  // Required above…

  verBlurb: "Initial release.",
  bidi: "ltr",              // or "rtl"

  publisher: "VizInt",
  contact_email: "",
  contact_url: "",
  contact_socials: "",

  iconEmoji: "🕰️",
  iconPng: "",
  iconBg: "rgba(0,0,0,.2)",
  iconBorder: "#888",

  capabilities: ["chronus", "atlas"],
  defaults: {},
  propsSchema: {},
  supportsSettings: true,
};
```

### 3.3 Capabilities

Valid capabilities:

* `"chronus"` – uses time/DST/anchors
* `"atlas"` – uses geo/GeoEnvelope
* `"network"` – performs remote fetches
* `"served"` – expects HTTP(S), warns under `file://`

---

## 4. Registration Pattern

Exactly one gadget entry per file.

**Canon (v1.2.2+):** All gadgets (single, multi, system) register **by class only**, using `manifest._class` as the key.

Portal is solely responsible for mapping `(classId, instanceId)` at runtime.

### 4.1 Canonical v1.2 Registration

```
(function () {
  const manifest = { /* ... */ };

  function mount(host, ctx) { /* render */ }
  function unmount(host, ctx) { host.innerHTML = ""; }
  function onInfoClick(ctx, { slot, body }) { /* optional */ }

  window.GADGETS = window.GADGETS || {};
  window.GADGETS[manifest._class] = {
    manifest,
    mount,
    unmount,
    onInfoClick,
    // onSettingsRequested, onLayoutChanged, etc., as needed
  };
})();
```

### 4.2 Keying Doctrine

Canonical key (v1.2.2+):

```
window.GADGETS[manifest._class] = { … };
```

No instance in the key.

There is **never** more than one table entry per gadget class. Instances are created by Portal, not by adding more keys to `window.GADGETS`.

Legacy note (informational):

Earlier versions sometimes used composite keys like:

* `${manifest._class}:${manifest._id}`
* or `"Clock:Local"`

These remain supported for older gadgets already in the wild, but:

* MUST NOT be used for new gadgets.
* MUST be phased out when migrating old gadgets to this v1.2.2 spec.
* MUST NOT be used as a source of truth for instance identity — Portal owns `instanceId`.

Portal builds the runtime `(classId, instanceId)` mapping from:

* `manifest._class` → normalized `classId`
* Internal `instanceId` tokens maintained inside `settings.instances[classId]`.

Gadgets never see or construct these IDs directly.

---

## 5. mount(host, ctx) Contract

### 5.1 Signature

```
function mount(host, ctx) { }
```

* `host`: the gadget’s container
* `ctx`: per-instance context created by Portal

### 5.2 Context Shape (Portal v1.2)

```
ctx = {
  name: "Vz:<Class>:<Instance>",

  host,        // same as mount(host, ctx) argument

  env: {
    geometry: { cols, rows },
    layout: {
      category,
      flags: { isMultiCol, colSpan },
    },
    isDark: boolean,
    bidi: "ltr" | "rtl",
  },

  libs: {
    Core,
    Atlas,
    Chronus,
    Nexus,
  },

  getSettings(key, def),
  setSettings(patch),
  resetSettings(),
};
```

### 5.3 Gadget Rules

Gadgets:

* MUST NOT write settings inside `mount()` just to “initialize defaults”. Use `getSettings(key, def)` with a default instead.
* MUST NOT mutate GeoEnvelope objects returned by Atlas.
* MUST NOT access `localStorage` directly.
* SHOULD use `ctx.libs` rather than any deprecated globals.

---

## 6. Settings & Storage

Gadgets use only:

* `ctx.getSettings(key?, defaultValue?)`
* `ctx.setSettings(patchObject)`
* `ctx.resetSettings()`

Portal maps settings internally to something like:

```
vz:gadgets:{classId}:{instanceId}:*
```

Gadgets must not:

* Iterate or inspect unrelated storage keys
* Depend on specific key names in `localStorage`
* Assume any particular storage backend (localStorage vs IndexedDB vs future)

---

## 7. Shared Libraries via ctx.libs

### 7.1 Chronus

Provides timezone-aware `now`, DST, transitions, and anchors.

```
const { Chronus } = ctx.libs;
```

### 7.2 Atlas

Provides `GeoEnvelope`.

```
const { Atlas } = ctx.libs;
await Atlas.ready;
const geo = Atlas.getBestGeo();
```

### 7.3 Nexus

Event bus + ticker/toast.

```
const bus = ctx.libs.Nexus.bus;
bus.emit("ticker", payload);
```

### 7.4 Core

Utility functions for formatting, layout classification, etc.

---

## 8. File Policy & `served` Capability

Under `file://`:

* All gadgets still mount.
* Gadgets with `"served"` show warnings (e.g., when they expect CORS-friendly HTTP(S) or remote APIs).

---

## 9. Legacy Compatibility

* Legacy gadgets (no manifest) work with minimal chrome.
* `ctx.shared` exists for legacy but is deprecated.

Modern gadgets MUST use:

* `manifest`
* `ctx.libs`
* settings APIs

---

## 10. Example v1.2 Gadget

```
(function () {
  const manifest = {
    _api: "1.0",
    _class: "HelloWorld",
    _type: "single",
    _id: "Local",
    _ver: "v1.0.0",
    label: "Hello World (Local)",
    iconEmoji: "👋",
    capabilities: [],
  };

  function mount(host, ctx) {
    host.innerHTML = `<div style="padding:8px;text-align:center;">Hello VizInt!</div>`;
  }

  function unmount(host) {
    host.innerHTML = "";
  }

  function onInfoClick(ctx) {
    console.log(manifest.label);
  }

  window.GADGETS = window.GADGETS || {};
  window.GADGETS[manifest._class] = {
    manifest,
    mount,
    unmount,
    onInfoClick,
  };
})();
```

---

## 11. Migration Guide v1.0 → v1.2.2

Concrete steps to bring an older gadget into compliance with this spec.

### 11.1 Steps

1. **Add a proper manifest**
   Ensure `_api: "1.0"`, `_class`, `_type`, `_id`, `_ver`, and `label` exist.

2. **Normalize registration to `manifest._class` only**
   Replace any of the following:

   ```
   window.GADGETS["Clock:Local"] = { … };
   window.GADGETS[`${manifest._class}:${manifest._id}`] = { … };
   ```

   with:

   ```
   window.GADGETS[manifest._class] = { … };
   ```

   Do **not** embed instance identity or numeric suffixes in the registration key.
   Single-instance gadgets are single by policy (`_type: "single"`), not by how many keys they add.

3. **Replace `ctx.shared` with `ctx.libs`**
   Use `ctx.libs.Core`, `ctx.libs.Chronus`, `ctx.libs.Atlas`, `ctx.libs.Nexus` instead of any shared globals.

4. **Replace direct storage with settings APIs**
   Remove direct `localStorage` manipulations.
   Use `ctx.getSettings`, `ctx.setSettings`, `ctx.resetSettings`.

5. **Declare capabilities truthfully**
   Add `capabilities: []` and populate with `"chronus"`, `"atlas"`, `"network"`, `"served"` as appropriate.

6. **Avoid settings writes inside mount()**
   Use defaults in `getSettings` rather than writing on first mount.

7. **Optional but recommended**
   Implement `onInfoClick(ctx, shell)` and `onSettingsRequested(ctx, shell)` for better UX and future Settings integration.

---

## 12. Multi-Instance Gadget Authoring (v1.2.x)

**Scope:** How gadget authors add full multi-instance support in VizInt.

Multi-instance support is not automatic. A gadget becomes multi-instance only if the author explicitly opts-in by providing the correct manifest fields and following the naming, id, and settings rules described below.

This section explains how to convert any gadget to multi-instance in **Portal v1.2.14+** under the W48/48 identity model, Stage-2C instance catalog, and descriptor semantics agreed by UX, Portal, Factory, and Orchestrator.

---

### 12.1 Overview

A multi-instance gadget is a gadget that can appear more than once on the dashboard, each with its own:

* independent DOM container
* independent settings namespace
* independent layout state
* independent `instanceId`

Portal automatically handles:

* `instanceId` generation
* normalization
* collision suffixing (`#02`, `#03`, …)
* persistent instance catalog
* settings migration upon rename
* descriptor rebuild + chrome refresh
* instance-added / instance-removed / renamed events

Gadget authors do **not** implement normalization or suffixing; Portal does.

---

### 12.2 Authoring Requirements (Mandatory)

To make a gadget multi-instance:

1. **Manifest must declare `_type: "multi"`**

   ```
   const manifest = {
     _api: "1.0",
     _class: "FlashCards",
     _type: "multi",
     _id: "default",
     _ver: "v1.2.0",
     label: "Flash Cards",
     supportsSettings: true,
   };
   ```

   * `_class` = identity root.
   * `_type = "multi"` enables instance creation (+) in Settings.
   * `_id` remains "default" because Portal owns per-instance IDs now.

   **Note on `_ver`:**
   `_ver` reflects the gadget code version and is strictly informational.
   Portal is allowed to treat it as an opaque string; do not rely on it for logic.

2. **Registration requires no instanceId logic**

   ```
   (function () {
     const manifest = { /* ... */ };

     function mount(host, ctx) { /* render */ }
     function unmount(host, ctx) { host.innerHTML = ""; }

     function onSettingsRequested(ctx, shell) { /* optional, per-instance */ }
     function onInfoClick(ctx, shell) { /* optional */ }

     window.GADGETS = window.GADGETS || {};
     window.GADGETS[manifest._class] = {
       manifest,
       mount,
       unmount,
       onSettingsRequested,
       onInfoClick,
     };
   })();
   ```

   * Do **NOT** key by `"Class:Instance"`.
   * Do **NOT** embed `instanceId` into the key.
   * Portal will create multiple instances of the one registered gadget entry.

3. **Gadget must treat `ctx` as fully instance-scoped**

Every call to:

* `ctx.getSettings()`
* `ctx.setSettings()`
* `ctx.resetSettings()`

…already points to the correct per-instance namespace:

```
vz:gadgets:{classId}:{instanceId}:*
```

The gadget should NOT attempt to:

* store its own `instanceId`
* generate instance names
* migrate settings between instances
* manage storage keys
* guess normalizer behavior

Portal handles all of these tasks.

---

### 12.3 What Portal Guarantees to Multi-Instance Gadgets

**A. Unique instanceId generation**

Portal generates per-class identifiers like:

```
{normalizedClass}
{normalizedClass}#02
{normalizedClass}#03
…
```

…but gadgets never see or construct these strings directly. They’re part of internal descriptor and storage wiring.

**B. displayName and rename support**

Descriptors include both:

* `instanceId` (stable, normalized, internal)
* `displayName` (user-facing, editable)

Portal fires:

* `portal:gadgetRenamed`
* `portal:gadgetInstancesChanged`

Chrome and Settings use these events to refresh the UI; gadgets do not observe or handle them directly.

**C. Independent layout state**

Portal maintains:

```
settings.layout[classId][instanceId] = {
  collapsed:  boolean,
  spanWide:   boolean,
  fullscreen: boolean,
};
```

Chrome maps these into CSS classes:

* `g-minimized` ⇄ `collapsed`
* `g-spanwide` ⇄ `spanWide`
* `g-fullscreen` ⇄ `fullscreen`

Layout state is per-instance and Portal-owned.

**D. Settings namespace isolation**

Each instance uses:

```
vz:gadgets:{classId}:{instanceId}:*
```

Multiple instances of the same class never collide in settings.

---

### 12.4 Modifications Required in Gadget Code (Conversion Checklist)

**Step 1 — Set `_type: "multi"`**

Before:

```
const manifest = {
  _api: "1.0",
  _class: "Clock",
  _type: "single",
  _id: "Local",
  _ver: "v0.1.0",
  label: "Clock (Local)",
};
```

After:

```
const manifest = {
  _api: "1.0",
  _class: "Clock",
  _type: "multi",     // key distinction
  _id: "default",     // variant id; Portal owns instance identities now
  _ver: "v1.2.0",
  label: "Clock",
};
```

**Step 2 — Stop using `_id` as identity**

* `_id` is an author-defined variant marker only (e.g. "default", "experimental") — not the instance’s identity.
* Instance identity lives in Portal’s `instanceId` and `displayName`.

**Step 3 — Use `host` safely**

```
function mount(host, ctx) {
  host.innerHTML = "";
  host.appendChild(/* your gadget DOM */);
}
```

Avoid querying the DOM globally; work inside `host`.

**Step 4 — Use settings APIs only**

```
const current = ctx.getSettings() || {};
const message = current.message || "Hello World";

function saveMessage(next) {
  ctx.setSettings({ message: next });
}
```

For simple cases you can use key-level defaults:

```
const message = ctx.getSettings("message", "Hello World");
ctx.setSettings({ message: "Updated!" });
```

**Step 5 — Avoid any logic based on instance counts**

Do not:

* introspect how many instances exist via `Portal.getInstances` inside the gadget
* assign behavior based on “I must be #01” or “#02”
* coordinate layout between siblings

If you truly need cross-instance coordination, that’s a System/Portal feature, not a local gadget trick.

---

### 12.5 Adding Settings for Multi-Instance Gadgets

Use the canonical Settings gear pipeline:

```
function onSettingsRequested(ctx, shell) {
  const host = (shell && (shell.body || shell.slot)) || null;
  if (!host) return;

  const S = {
    get: () => ctx.getSettings() || {},
    set: (patch) => ctx.setSettings(patch),
  };

  const current = S.get();
  host.innerHTML = "";

  const form = document.createElement("form");
  form.className = "my-gadget-settings";

  const label = document.createElement("label");
  label.textContent = "Message";
  const input = document.createElement("input");
  input.type = "text";
  input.value = current.message || "";

  form.appendChild(label);
  form.appendChild(input);

  const buttonsRow = document.createElement("div");
  buttonsRow.style.display = "flex";
  buttonsRow.style.justifyContent = "flex-end";
  buttonsRow.style.gap = "6px";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.textContent = "Cancel";

  const saveBtn = document.createElement("button");
  saveBtn.type = "submit";
  saveBtn.textContent = "Save";

  buttonsRow.appendChild(cancelBtn);
  buttonsRow.appendChild(saveBtn);
  form.appendChild(buttonsRow);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    S.set({ message: input.value.trim() });
    // Portal/chrome own whether to re-mount/refresh instance and how the dialog is closed.
  });

  cancelBtn.addEventListener("click", () => {
    // Let chrome/Portal handle closing; at minimum, you can clear or ignore.
    // In most cases, leaving behavior to the host is preferred.
  });

  host.appendChild(form);
}
```

Each instance receives its own Settings panel and persistence.

---

### 12.6 Info Icon Behavior (Optional)

```
function onInfoClick(ctx, { slot, body }) {
  if (!body) return;
  body.innerHTML = `
    <div style="padding:8px;font-size:12px;">
      This gadget supports multiple instances. Each instance has its own settings and layout.
    </div>`;
}
```

If `onInfoClick` is omitted, Portal falls back to manifest metadata where available.

---

### 12.7 Example: Converting a Simple Gadget (End-to-End)

**Original single-instance gadget:**

```
(function () {
  const manifest = {
    _api: "1.0",
    _class: "Clock",
    _type: "single",
    _id: "Local",
    _ver: "v0.1.0",
    label: "Clock (Local)",
  };

  function mount(host) {
    host.innerHTML = `<div>Clock goes here</div>`;
  }

  window.GADGETS = window.GADGETS || {};
  window.GADGETS["Clock:Local"] = { manifest, mount };
})();
```

**Migrated multi-instance gadget (v1.2.2):**

```
(function () {
  const manifest = {
    _api: "1.0",
    _class: "Clock",
    _type: "multi",      // multi-instance
    _id: "default",      // simple variant id
    _ver: "v1.2.0",      // This reflects the gadget code version and is purely informational.
    label: "Clock",
    iconEmoji: "🕰️",
    supportsSettings: true,
    capabilities: ["chronus"],
  };

  function mount(host, ctx) {
    host.innerHTML = "";
    const box = document.createElement("div");
    box.style.padding = "8px";
    box.style.textAlign = "center";

    const timeSpan = document.createElement("span");
    box.appendChild(timeSpan);
    host.appendChild(box);

    const { Chronus } = ctx.libs;
    function renderTime() {
      const now = Chronus.now();
      timeSpan.textContent = now.format("HH:mm:ss");
    }

    renderTime();
    box.__timer = setInterval(renderTime, 1000);

    host.__vi_unmount = () => {
      clearInterval(box.__timer);
      host.innerHTML = "";
    };
  }

  function unmount(host) {
    if (host.__vi_unmount) host.__vi_unmount();
    else host.innerHTML = "";
  }

  function onSettingsRequested(ctx, shell) {
    // Optionally let user choose a timezone, format, etc.
  }

  window.GADGETS = window.GADGETS || {};
  window.GADGETS[manifest._class] = {
    manifest,
    mount,
    unmount,
    onSettingsRequested,
  };
})();
```

Key differences:

* `_type: "multi"` + `_id: "default"`.
* Registration by `manifest._class`.
* No home-grown `instanceId` logic anywhere.

---

### 12.8 Common Mistakes

* ❌ Do NOT normalize `_class` — Portal does it.
* ❌ Do NOT assign or compute `instanceId` — Portal does it.
* ❌ Do NOT store data in `localStorage` — use settings APIs.
* ❌ Do NOT write to `window.GADGETS` using instance keys — only one entry per class.
* ❌ Do NOT infer instance ordering from DOM — use Settings UI and Portal APIs at the system level instead.

---

### 12.9 Testing Your Multi-Instance Gadget

Use the Settings UI class row:

```
[ + ] Flash Cards
```

Clicking `+` should:

* create a new instance
* mount it in the dock
* preserve independent settings
* allow rename/remove/reorder in Settings

To test isolation:

1. Create two instances of your gadget.
2. Open Settings for instance A; change a value.
3. Confirm instance B remains unchanged.
4. Reorder or rename instances from Settings; confirm both instances still render correctly.

If any of this fails → the bug is likely in Portal/Chrome/Settings plumbing, not in the gadget, assuming you followed this spec.

---

### 12.10 Summary Checklist (Author-Facing)

| Task                                  | Required?   | Notes                                       |
| ------------------------------------- | ----------- | ------------------------------------------- |
| Set `_type: "multi"`                  | ✅           | Enables multi-instance support              |
| Use `window.GADGETS[manifest._class]` | ✅           | Canonical registration for all gadget types |
| Never normalize `_class` yourself     | ✅           | Portal-only responsibility                  |
| Use settings API (`get/set/reset`)    | ✅           | Per-instance namespace                      |
| Ignore `instanceId` details           | ✅           | Portal owns identity & collision model      |
| Implement `onSettingsRequested`       | Recommended | Per-instance config                         |
| Implement `onInfoClick`               | Recommended | Better UX                                   |
| Keep one gadget entry per file        | Mandatory   | Single class-level registration             |

---

### 12.11 Informational Note — How Multi-Instance Gadgets Appear in the UI (Non-Authoritative)

This section is informational only for gadget authors.
The authoritative UI rules live in the **Portal v1.2.x Specification**, not here.

Multi-instance gadgets appear in the Settings Manager using:

* a **Class Row**, representing the gadget class
* **Instance Rows**, representing each created instance

Portal and chrome.js own and implement:

* the Add Instance button on the class row
* instance creation and default-name generation
* remove-instance confirmation modal
* rename interaction (label → textbox with ✓/✖ semantics)
* visibility checkbox
* badge grid alignment
* instance reordering rules

Gadget authors do **not** implement any of these interactions.
Authors work only with:

* `ctx.getSettings()`
* `ctx.setSettings()`
* gadget-local UI

All instantiation, renaming, and deletion logic resides exclusively in Portal + chrome.js.

---

### 12.12 Cookbook: Converting an Existing Singleton Gadget to Multi-Instance

This mini cookbook is aimed at Factory (U:Fx) and other authors doing batch conversions.

Given a working, v1.2-ish single-instance gadget:

1. Confirm manifest exists and add/repair fields as necessary.
2. Switch `_type` from `"single"` to `"multi"`.
3. Normalize `_id` to `"default"` (unless you truly have multiple distinct variants in code).
4. Change registration to `window.GADGETS[manifest._class]`.
5. Scan for any of the following and remove them:

   * `window.GADGETS["Class:Something"]` or template literals using `_id` in the key.
   * Manual `instanceId` or `#02/#03` style suffixing.
   * Logic referencing “the second copy”, “Copy #1”, etc.
   * Direct `localStorage` keys that include class or instance names.
6. Replace direct storage with `ctx.getSettings` / `ctx.setSettings`.
7. Run through the test steps in §12.9.
8. Bump `_ver` and update the gadget’s own changelog/comments to reflect multi-instance support.

If you follow those steps and your gadget still misbehaves in multi-instance scenarios, capture what you see and escalate via CXP — the fix likely belongs in Portal/Chrome/Settings, not in the gadget.

---

### 12.13 Cookbook: Authoring a Brand-New Multi-Instance Gadget

For a new gadget that you know should be multi-instance from day one:

1. Start from the canonical skeleton:

   * manifest with `_api`, `_class`, `_type: "multi"`, `_id: "default"`, `_ver`, `label`.
   * `mount(host, ctx)` that only touches `host`.
   * `unmount(host)` that clears timers/listeners and DOM.
   * Optional `onSettingsRequested`, `onInfoClick`.

2. Register with:

   ```
   window.GADGETS = window.GADGETS || {};
   window.GADGETS[manifest._class] = {
     manifest,
     mount,
     unmount,
     onSettingsRequested,
     onInfoClick,
   };
   ```

3. Use `ctx.libs` for any shared facilities (Chronus, Atlas, Nexus, Core).

4. Design settings as if each instance lives in its own world.
   Never assume that changes in one instance should automatically affect another instance.

5. Lean on the Settings Manager UI for instance creation/removal/rename.
   Do not add your own per-instance management UI unless it’s a specialized case that has been explicitly agreed at the system level.

6. Document capabilities and expected environments (`"served"`, `"network"`, etc.) so that Portal and Chrome can surface correct hints/warnings.

---

## 📘 Multi-Instance Gadget Instantiation — Consolidated UI Design Brief (v1.2)

*(Informational; for UX/Portal/Settings implementors)*

This section defines exactly how the user interface must allow creating new instances of multi-instance gadgets.
These rules apply to the Settings Gadget UI, and to any environment where the list of gadgets and instances is presented.

### Top-Level Model

A multi-instance gadget presents two levels in the Settings UI:

* **Class Row (parent)** — The gadget type, e.g.:

  * "Chronus Timer"
  * "Flash Cards"
  * "Prayer Times Widget"

* **Instance Rows (children)** — Each specific instance of that class:

  * "Chronus Timer #01"
  * "Chronus Timer #02"

The class row comes first, instance rows are indented beneath it.

### Class Row UI — Where Instantiation Happens

The class row contains a **➕ Add Instance** button.

This is the **only** place the user creates new instances.

Canonical class row layout:

```
[ + ]   [Class Icon]   {Gadget Class Name}   [Badges…]   [↑]  [↓]
```

**➕ Button Behavior**

When the user clicks ➕:

* A new instance is created.
* It is assigned the next sequential `instanceId`.
* The default name for the instance is generated: `{Gadget Class} #nn`
  (e.g., “Flash Cards #01”, “Flash Cards #02”).
* A new instance row appears immediately under the class row.
* Focus optionally moves to the new instance’s name label, ready for rename.

Important UX notes:

* No checkbox on the class row — class row is not itself an instance.
* Badges on the class row show capabilities of the class, not per-instance.
* Up/down arrows move the entire block (class row + its instances) among other gadget classes.

### Instance Rows — How New Instances Appear

When created, each instance row follows the canonical layout:

```
[ – ]  [☐]  [Icon]  {Instance Name (editable)}   [Badges…]   [↑] [↓]
```

Elements:

* `–` Remove: triggers a confirmation modal before deletion.
* `☐` Visibility checkbox: controls show/hide for that specific instance.
* Icon: same icon as the gadget class.
* Editable name: label → textbox with Enter/✓ commit, Esc/✖ cancel. Empty names forbidden.
* Badges: align with the global badge grid.
* Arrows: reorder instances only within the class block.

### Visual Separation & Layout Rules

* Instance rows are indented relative to class row.
* (Optional) A light dotted or faint vertical guide may visually connect them.
* Badge columns align perfectly across:

  * single-instance gadgets
  * class rows
  * instance rows

### Required Behavior for Instantiation (Cross-Volk)

**Portal (U:Vz) MUST:**

* Implement the ➕ instance creation logic.
* Assign `instanceId` and generate default name.
* Create namespace `vz:gadgets:{classId}:{instanceId}:*`.
* Persist instance order within class.
* Persist class block order among gadgets.
* Provide descriptors describing each new instance to chrome.js.

**UX (U:Ux) MUST:**

* Provide final chrome for:

  * ➕ button appearance
  * indentation
  * badge alignment grid
  * editable-name transitions
  * remove-instance modal styling
* Ensure class vs instance distinction is visually unmistakable.

**Gadgematix (U:Gx) MUST:**

* Keep this authoring guide aligned with runtime behavior.
* Provide multi-instance examples (e.g., FlashCards, EmbedWeb).
* Ensure new templates use `manifest._class` registration and `_type: "multi"` where appropriate.

### Interaction Summary (UX-Ready)

* **Create Instance** – User clicks ➕ → new instance row appears below class row.
* **Rename Instance** – Click name → textbox → Enter/✓ commits.
* **Remove Instance** – Click `–` → confirmation → instance removed + settings deleted.
* **Reorder** – Class row arrows move the entire block; instance row arrows move only that instance.
* **Toggle Visibility** – Checkbox controls visibility for that instance only.

---

**End of VizInt Gadget Authoring Specification — v1.2**
