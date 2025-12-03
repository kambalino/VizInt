# VizInt Gadget Authoring Specification – v1.2

**$VER: 1.2.1 (025/11/30)**
**$HISTORY:**

*	2025/11/30	1.2.1:	Changed _type enum to "single" | "multi" | "system"; deprecating "singleton" and "instantiable" 
*	2025/11/22	1.2.0:	Harmonized with System v1.2, Portal v1.2, Chronus v1.2, Atlas v1.2. Clarified manifest requirements, capabilities, ctx.libs usage, storage doctrine, GeoEnvelope consumption, and file:// policy.
*	2025/11/11	1.0.0:	Initial Gadget API v1.0 spec (manifest, mount, basic capabilities).

---

## 0. Scope & Relationship to Other Specs

This document defines the **authoring contract for gadgets** in the VizInt v1.2 system.

It supersedes and refines the earlier Gadget API v1.0 document while keeping `_api: "1.0"` as the required manifest value.

It is consistent with:

* **System Spec v1.2** (architecture, capabilities model, storage doctrine).
* **Portal Spec v1.2** (manifest validation, ctx injection, file policy).
* **Atlas v1.2** and **Chronus v1.2** (GeoEnvelope semantics, time/anchor model).

Everything valid in v1.0 remains valid unless explicitly deprecated.

---

## 1. What Is a Gadget?

A **VizInt gadget** is a self-contained JavaScript module that:

1. Registers itself: `window.GADGETS[<key>] = { manifest, mount, ... }`.
2. Provides:

   * A **manifest** object with mandatory fields.
   * A **mount(host, ctx)** function.
3. Runs entirely client-side (HTML/CSS/JS only).
4. Must operate under **https://**, **http://**, and **file://**.

---

## 2. Lifecycle Overview

**Discovery → Mount → Steady State → Unmount → Migration**

Portal owns the lifecycle; gadgets operate within the container provided as `host`.

---

## 3. Manifest Schema (v1.2, API "1.0")

Every v1.2 gadget MUST define a manifest object.

### 3.1 Required Fields

```js
const manifest = {
  _api: "1.0",				// Required gadget API version
  _class: "Clock",			// Gadget family
  _type: "single",			// "single" | "multi" for multi-instance gadgets | "system" for system gadgets - which are also singletons
  _id: "Local",				// Instance identifier
  _ver: "v0.1.0",			// Gadget version
  label: "Clock (Local)",	// Display name
};
```

### 3.2 Recommended Fields

```js
const manifest = {
  // Required above…

  verBlurb: "Initial release.",
  bidi: "ltr", // or "rtl"

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
* `"served"` – expects HTTP(S), warns under file://

---

## 4. Registration Pattern

Exactly one gadget entry per file.

### 4.1 Canonical v1.2 Registration

```js
(function(){
  const manifest = { /* ... */ };

  function mount(host, ctx) {}
  function unmount(host, ctx) { host.innerHTML = ""; }
  function onInfoClick(ctx, { slot, body }) {}

  window.GADGETS = window.GADGETS || {};
  window.GADGETS[`${manifest._class}:${manifest._id}`] = {
    manifest,
    mount,
    unmount,
    onInfoClick,
  };
})();
```

### 4.2 Recommended Keying

* Registry ID: `Class:Instance`
* Gadget table key: same string

Legacy formats remain supported.

---

## 5. `mount(host, ctx)` Contract

### 5.1 Signature

```js
function mount(host, ctx) { }
```

* `host`: the gadget’s container
* `ctx`: per-instance context created by Portal

### 5.2 Context Shape (Portal v1.2)

```js
ctx = {
  name: "Vz:<Class>:<Id>",
  host,
  env: {
    geometry: { cols, rows },
    layout: { category, flags: { isMultiCol, colSpan } },
    isDark: boolean,
    bidi: "ltr" | "rtl",
  },
  libs: { Core, Atlas, Chronus, Nexus },
  getSettings(key, def),
  setSettings(patch),
  resetSettings(),
};
```

### 5.3 Gadget Rules

* MUST NOT write settings inside mount()
* MUST NOT mutate GeoEnvelope
* MUST NOT access localStorage directly
* SHOULD use `ctx.libs` rather than any deprecated globals

---

## 6. Settings & Storage

Gadgets use only:

* `ctx.getSettings()`
* `ctx.setSettings()`
* `ctx.resetSettings()`

Portal maps:

```
Vz:<Class>:<Instance>
```

Gadgets **must not** iterate or inspect unrelated storage keys.

---

## 7. Shared Libraries via ctx.libs

### 7.1 Chronus

Provides timezone-aware now, DST, transitions, anchors.

```js
const { Chronus } = ctx.libs;
```

### 7.2 Atlas

Provides GeoEnvelope.

```js
const { Atlas } = ctx.libs;
await Atlas.ready;
const geo = Atlas.getBestGeo();
```

### 7.3 Nexus

Event bus + ticker/toast.

```js
const bus = ctx.libs.Nexus.bus;
bus.emit("ticker", payload);
```

### 7.4 Core

Utility functions for formatting, layout classification, etc.

---

## 8. File Policy & `served` Capability

Under `file://`:

* All gadgets still mount.
* Gadgets with `"served"` show warnings.

---

## 9. Legacy Compatibility

Legacy gadgets (no manifest) work with minimal chrome.
`ctx.shared` exists for legacy but is deprecated.

---

## 10. Example v1.2 Gadget

```js
(function(){
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

  function unmount(host) { host.innerHTML = ""; }
  function onInfoClick(ctx) { console.log(manifest.label); }

  window.GADGETS = window.GADGETS || {};
  window.GADGETS[`${manifest._class}:${manifest._id}`] = { manifest, mount, unmount, onInfoClick };
})();
```

---

## 11. Migration Guide v1.0 → v1.2

1. Add manifest (`_api:"1.0"`, `_class`, `_type`, `_id`, `_ver`, `label`).
2. Normalize registration key to `Class:Instance`.
3. Replace `ctx.shared` with `ctx.libs`.
4. Replace direct `localStorage` with settings APIs.
5. Declare capabilities truthfully.
6. Avoid settings writes inside mount().

---


# VizInt Gadgets Specification (v1.2.x)

## 12. Multi-Instance Gadget Authoring (v1.2.x)

*How gadget authors add full multi-instance support in VizInt*

Multi-instance support is **not automatic**. A gadget becomes multi-instance only if the author explicitly opts-in by providing the correct manifest fields and following the naming, id, and settings rules described below.

This section explains how to convert any gadget to multi-instance in **Portal v1.2.14+** under the W48 identity model, Stage‑2C instance catalog, and descriptor semantics agreed by UX, Portal, Factory, and Orchestrator.

---

## 12.1 Overview

A **multi-instance gadget** is a gadget that can appear **more than once** on the dashboard, each with its own:

* independent DOM container
* independent settings namespace
* independent layout state
* independent instanceId

Portal automatically handles:

* instanceId generation
* normalization
* collision suffixing (#02, #03…)
* persistent instance catalog
* settings migration upon rename
* descriptor rebuild + chrome refresh
* instance-added / instance-removed / renamed events

Gadget authors do **not** implement normalization or suffixing; Portal does.

---

## 12.2 Authoring Requirements (Mandatory)

To make a gadget multi-instance:

### 1. Manifest must declare `_type: "multi"`

```
const manifest = {
  _api: "1.0",
  _class: "FlashCards",
  _type: "multi",
  _id: "default",
  _ver: "v1.2.0",
  label: "Flash Cards",
  supportsSettings: true
};
```

* `_class` = **identity root**
* `_type = "multi"` enables instance creation (+) in Settings
* `_id` remains "default" because Portal owns per-instance IDs now

### 2. Registration requires NO instanceId logic

```
(function(){
  const manifest = { /* ... */ };
  function mount(host, ctx) { /* render */ }
  function unmount(host, ctx) { host.innerHTML = ""; }
  window.GADGETS = window.GADGETS || {};
  window.GADGETS[manifest._class] = {
    manifest,
    mount,
    unmount,
    onSettingsRequested,
    onInfoClick
  };
})();
```

**Do NOT** key by `Class:Instance`. Portal will generate and manage instance keys **internally**.

### 3. Gadget must treat `ctx` as fully instance-scoped

Every call to:

* `ctx.getSettings()`
* `ctx.setSettings()`
* `ctx.resetSettings()`

…already points to the correct per-instance namespace:

```
vz:gadgets:{classId}:{instanceId}:*
```

The gadget should **NOT** attempt to:

* store its own instanceId
* generate names
* migrate settings
* manage storage keys
* guess normalizer behavior

Portal handles all these tasks.

---

## 12.3 What Portal Guarantees to Multi-Instance Gadgets

### A. Unique instanceId generation

Portal generates:

```
{normalizedClass}
{normalizedClass}#02
{normalizedClass}#03
...
```

### B. displayName and rename support

Descriptors include both:

* `instanceId` (stable, normalized)
* `displayName` (user-facing, editable)

Portal fires:

* `portal:gadgetRenamed`
* `portal:gadgetInstancesChanged`

### C. Independent layout state

```
settings.layout[classId][instanceId] = {
  collapsed: boolean,
  spanWide: boolean,
  fullscreen: boolean
};
```

### D. Settings namespace isolation

Each instance uses:

```
vz:gadgets:{classId}:{instanceId}:*
```

---

## 12.4 Modifications Required in Gadget Code

### Step 1 — Set `_type: "multi"`

```
const manifest = {
  _api:"1.0",
  _class:"FlashCards",
  _type:"multi",
  _id:"default",
  _ver:"v1.2.0",
  label:"Flash Cards"
};
```

### Step 2 — Stop using `_id` as identity

Portal owns all instance identities.

### Step 3 — Use `ctx.host` safely

```
function mount(host, ctx){
  host.innerHTML = "";
  host.appendChild(/* new content */);
}
```

### Step 4 — Use settings APIs only

```
const message = ctx.getSettings("message", "Hello World");
ctx.setSettings({ message: newValue });
```

### Step 5 — Avoid any logic based on instance counts

Do **not**:

* detect collisions
* detect instance numbering
* detect sibling instances

Portal owns all of this.

---

## 12.5 Adding Settings for Multi-Instance Gadgets

### Use the canonical Settings gear pipeline

```
export function onSettingsRequested(ctx, { slot, body }) {
  body.innerHTML = "";
  const input = document.createElement("input");
  input.value = ctx.getSettings("foo", "");
  input.oninput = () =>
    ctx.setSettings({ foo: input.value });
  body.appendChild(input);
}
```

Each instance receives its **own** panel and persistence.

---

## 12.6 Info Icon Behavior (Optional)

```
export function onInfoClick(ctx, { slot, body }) {
  body.innerHTML = `
    <div class="info">
      This gadget supports multiple instances. Each instance has its own settings.
    </div>`;
}
```

If omitted, Portal falls back to manifest metadata.

---

## 12.7 Example: Converting a Simple Gadget

Before:

```
const manifest = {
  _api:"1.0",
  _class:"Clock",
  _type:"single",
  _id:"Local",
  _ver:"v0.1.0",
  label:"Clock (Local)"
};
```

After:

```
const manifest = {
  _api:"1.0",
  _class:"Clock",
  _type:"multi", // this is the key distinction
  _id:"default",
  _ver:"v1.2.0", // This reflect the gadget code version and is merely informational.
  label:"Clock"
};
```

---

## 12.8 Common Mistakes

❌ Do NOT normalize `_class` — Portal does it.

❌ Do NOT assign or compute instanceId — Portal does it.

❌ Do NOT store data in `localStorage` — use settings APIs.

❌ Do NOT write to `window.GADGETS` using instance keys — only one entry per class.

---

## 12.9 Testing Your Multi-Instance Gadget

Use the Settings UI class row:

```
[ + ] Clock
```

Clicking + should:

* create a new instance
* mount it
* preserve independent settings
* allow rename/remove/reorder

If any of this fails → the bug is in **Portal**, not the gadget.

---

## 12.10 Summary Checklist

| Task                          | Required?   | Notes                          |
| ----------------------------- | ----------- | ------------------------------ |
| Set `_type:"multi"`           | ✅           | Enables multi-instance support |
| Use `manifest._class`         | ✅           | Canonical identity             |
| Never normalize               | ✅           | Portal-only responsibility     |
| Use settings API              | ✅           | Per-instance namespace         |
| Ignore `_id`                  | ✅           | Portal owns instance identity  |
| Implement onSettingsRequested | Recommended | Only if settings exist         |
| Implement onInfoClick         | Recommended | Better UX                      |
| Register one gadget per file  | Mandatory   | window.GADGETS[class] = {...}  |

---

### 12.11 Informational Note — How Multi-Instance Gadgets Appear in the UI (Non-Authoritative)

This section is *informational only* for gadget authors.  
The authoritative UI rules live in the **Portal v1.2.x Specification**, not here.

Multi-instance gadgets appear in the Settings Manager using:

- a **Class Row**, representing the gadget class  
- **Instance Rows**, representing each created instance  

Portal and chrome.js own and implement:

- the **Add Instance** button on the class row  
- **instance creation** and default-name generation  
- **remove-instance** confirmation modal  
- **rename interaction** (label → textbox with ✓/✖ semantics)  
- **visibility checkbox**  
- **badge grid alignment**  
- **instance reordering rules**  

Gadget authors **do not** implement any of these interactions.  
Authors work *only* with:

- `ctx.getSettings()`
- `ctx.setSettings()`
- gadget-local UI

All instantiation, renaming, and deletion logic resides exclusively in **Portal + chrome.js**.



**End of Section 12 — Multi-Instance Gadget Authoring (v1.2.x)**

// Content below should be merged/refactored/deleted soon

📘 Multi-Instance Gadget Instantiation — Consolidated UI Design Brief (v1.2)

This section defines exactly how the user interface must allow creating new instances of multi-instance gadgets.
These rules apply to the Settings Gadget UI, and to any environment where the list of gadgets and instances is presented.

1. Top-Level Model

A multi-instance gadget presents two levels in the Settings UI:

Class Row (parent)

The gadget type, e.g.:

“Chronus Timer”

“Flash Cards”

“Prayer Times Widget”

Instance Rows (children)

Each specific instance of that class:

“Chronus Timer #01”

“Chronus Timer #02”

The class row comes first, instance rows are indented beneath it.

2. Class Row UI — Where Instantiation Happens

The class row contains a ➕ Add Instance button.

This is the only place the user creates new instances.

Class Row Layout (canonical)
[ + ]   [Class Icon]   {Gadget Class Name}   [Badges…]   [↑]  [↓]

➕ Button Behavior

When the user clicks ➕:

A new instance is created.

It is assigned the next sequential instanceId.

The default name for the instance is generated:

{Gadget Class} #nn


(e.g., “Flash Cards #01”, “Flash Cards #02”)

A new instance row appears immediately under the class row.

Focus optionally moves to the new instance’s name label, ready for rename.

Important UX Notes

No checkbox on the class row.
Class row is not itself an instance.

Badges on the class row show capabilities of the class, not per-instance.

Up/down arrows move the entire block (class row + its instances) among other gadget classes.

3. Instance Rows — How New Instances Appear

When created, each instance row follows the canonical layout:

[ – ]  [☐]  [Icon]  {Instance Name (editable)}   [Badges…]   [↑] [↓]

The elements are:

– Remove
Always visible. Clicking it triggers a confirmation modal:

“Are you sure you want to permanently delete this instance and all its settings?”

☐ Visibility Checkbox
Controls show/hide for that specific instance.

Instance Icon
Same icon as the gadget class.

Editable Name

Displays as a label with subtle hover affordance.

Single click → becomes textbox.

Accept (✓ / Enter) commits.

Cancel (✖ / Escape) reverts.

Empty names forbidden.

Badges
Instance-level capability alignment (same columns as class row).

↑ ↓
Reorders instances within their class block only.

4. Visual Separation & Layout Rules

Instance rows are indented relative to class row.

(Optional) Light dotted or faint vertical guide connecting them.

Badge columns align perfectly across:

single-instance gadgets

class rows

instance rows

5. Required Behavior for Instantiation (Cross-Volk)
Portal (U:Vz)

Must:

Implement the ➕ instance creation logic.

Assign instanceId and generate default name.

Create namespace:

vz:gadgets:{classId}:{instanceId}:*


Persist instance order within class.

Persist class block order among gadgets.

Provide descriptor describing each new instance to chrome.js.

UX (U:Ux)

Must:

Provide final chrome for:

➕ button appearance

indentation

badge alignment grid

editable-name transitions

remove-instance modal styling

Ensure class vs instance distinction is visually unmistakable.

Gadgematix (U:Gx)

Must:

Update Gadget Authoring Guide:

Add multi-instance rules

Explain instanceId

Document per-instance settings namespace

Provide manifest examples with "multiInstance": true

6. Interaction Summary (UX-Ready)
Create Instance

User clicks ➕ → new instance row appears below class row.

Rename Instance

Click name → textbox → Enter/✓ commits.

Remove Instance

Click – → confirmation → instance removed + settings deleted.

Reorder

Class row arrows move entire block.
Instance row arrows move only that instance.

Toggle Visibility

Checkbox controls visibility for that instance only.