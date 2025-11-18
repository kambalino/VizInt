# VizInt Portal Specification – v1.2

*(Canonical runtime contract for the VizInt Portal. Implements System Spec v1.2 at the Portal layer.)*

---

# 0. Purpose

This document defines the **Portal Runtime Contract** — all rules, behaviors, and responsibilities that the Portal MUST/SHOULD/MAY follow when hosting VizInt gadgets.

This spec is distinct from:

* **System Spec v1.2** (architecture-wide rules)
* **Gadget Authoring Spec v1.0** (developer-facing)

Portal Spec v1.2 translates System Spec into concrete Portal behaviors.

---

# 1. Portal Responsibilities

The Portal MUST:

* Load and validate gadget manifests
* Inject `ctx.libs` into gadgets
* Provide a unified storage wrapper
* Own and render chrome
* Manage badges and capability-driven warnings
* Provide Nexus bus wiring
* Manage geometry & layout metadata
* Provide settings deletion facilities
* Ensure legacy gadget interoperability

The Portal MUST NOT:

* Allow gadgets to override chrome
* Allow gadgets to escape their viewport
* Permit direct localStorage misuse without warning

---

# 2. Gadget Manifest Processing

## 2.1 Required manifest fields

A gadget manifest MUST include:

```
_api
_class
_type
_id
_ver
label
```

## 2.2 Recommended fields

```
verBlurb
bidi
description
publisher
contact_email
contact_url
iconEmoji
iconPng
iconBg
iconBorder
capabilities
defaults
propsSchema
```

## 2.3 Legacy fallback

If a manifest is missing:

* `_class = filename`
* `_id = filename`
* `_type = "singleton"`
* Minimal chrome shown
* `ctx.libs` still injected

---

# 3. Portal Context Injection (`ctx`)

A mounted gadget receives:

```js
ctx = {
  name: "Vz:<Class>:<Instance>",
  host: HTMLElement,
  env: {
    geometry: { cols, rows },
    layout: { category, flags },
    isDark: boolean,
    bidi: "ltr" | "rtl",
  },
  libs: { Core, Chronus, Atlas, Nexus },
  getSettings(key, defaultValue),
  setSettings(patch),
  resetSettings(),
};
```

## 3.1 Deprecation Path: `ctx.shared`

* Portal MUST expose `ctx.shared` as a compatibility shim
* MUST warn in console on access
* Removed in v1.3

---

# 4. Storage Model (Portal Implementation)

The Portal MUST implement storage as:

```
Vz:<Class>:<Instance>
```

Portal MUST perform transparent namespacing.

Portal MUST expose:

```js
ctx.getSettings(key, defaultValue)
ctx.setSettings({ key: value })
ctx.resetSettings()
```

Portal MUST:

* Persist only JSON objects
* Debounce writes ≥100ms
* Prevent setSettings() during mount()

Portal MUST NOT allow gadgets to:

* Iterate over localStorage
* Clear localStorage
* Write outside their namespace

Bulk deletion:

* Per-instance
* Per-class

---

# 5. Capability Semantics (Portal Enforcement)

Portal MUST read:

```
capabilities: ["chronus", "atlas", "network", "served"]
```

Portal MUST map them to:

* chronus → provide Chronus
* atlas → provide Atlas
* network → allow fetch
* served → require HTTP(S)

## 5.1 File policy

Under file://:

* Gadgets MUST still mount
* If capability includes `served`, the Portal MUST:

  * show a ⚠ badge (first position)
  * optionally toast a warning

---

# 6. Chrome Specification

The Portal owns **all chrome**.

Chrome MUST include:

* Icon
* Label
* Capability badges
* Folding hub (💠) when enabled
* Window controls

Gadgets MUST NOT:

* Add their own chrome
* Relayout portal chrome

## 6.1 Badge Precedence

Order MUST be:

1. ⚠ (if applicable)
2. chronus
3. atlas
4. network
5. served

U:UX MAY adjust visual style.

---

# 7. Geometry & Layout

Portal MUST compute:

```js
geometry = { cols, rows }
```

Portal MUST call:

```js
Core.Layout.classify(geometry)
```

which returns:

```js
{ category, flags: { isMultiCol, colSpan } }
```

Portal MUST include both geometry & layout in `ctx.env`.

---

# 8. Event Bus (Nexus)

Portal MUST provide Nexus via:

```js
ctx.libs.Nexus.bus
```

Portal MUST ensure events include:

* auto-injected `from`
* auto-injected `ts`

Supported event channels:

* `ticker`
* `toast`
* `modal` (future)
* Custom gadget channels

Portal MUST route events to all subscribers.

---

# 9. Ticker System

Portal MUST:

* Maintain a session-only ticker log
* Render ticker messages from gadgets
* Enforce brevity (truncation allowed)

Gadgets MUST publish via:

```js
Nexus.bus.emit("ticker", payload)
```

---

# 10. Toast System

Portal MUST expose:

```js
Core.toast(msg, type)
```

Portal MUST render toast queue.

Alerts MUST NOT be used by gadgets.

---

# 11. Settings Manager UI

Portal MUST support:

* Per-instance reset
* Per-class reset
* Legacy gadget purge

Portal MAY expose advanced features in the future.

---

# 12. File Policy

Portal MUST:

* Allow gadgets to run on file://
* Warn for served gadgets
* Use Atlas fallback lookup rules

---

# 13. Legacy Gadget Handling

Portal MUST:

* Construct fallback manifest
* Avoid breaking older gadgets
* Provide minimal chrome & ctx.libs

Legacy gadgets SHOULD be migrated by U:Factory.

---

# 14. Compliance Rules

Portal MUST:

* Follow System Spec v1.2
* Reject malformed manifests
* Guarantee deterministic gadget loading

Portal SHOULD:

* Warn on deprecated fields
* Warn on storage misuse

Portal MAY:

* Provide debugging overlays

---

# END OF PORTAL SPEC v1.2
