# VizInt Gadget Authoring Specification – v1.2

**$VER: 1.2.0 (2025/11/22)**
**$HISTORY:**

* *2025/11/22 – v1.2.0:* Harmonized with System v1.2, Portal v1.2, Chronus v1.2, Atlas v1.2. Clarified manifest requirements, capabilities, ctx.libs usage, storage doctrine, GeoEnvelope consumption, and file:// policy.
* *2025/11/11 – v1.0.0:* Initial Gadget API v1.0 spec (manifest, mount, basic capabilities).

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
  _api: "1.0",            // Required gadget API version
  _class: "Clock",        // Gadget family
  _type: "singleton",     // "singleton" | "instantiable"
  _id: "Local",           // Instance identifier
  _ver: "v0.1.0",         // Gadget version
  label: "Clock (Local)", // Display name
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
    _type: "singleton",
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
