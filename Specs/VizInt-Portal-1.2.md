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

### Descriptor Requirements for Multi-Instance Gadgets (Authoritative v1.2.x)

Portal MUST generate a descriptor object for every gadget instance.  
For multi-instance gadgets, each descriptor must include at minimum:

- `classId`
- `instanceId`
- `displayName`
- `capabilities`
- `badges` (derived from capabilities)
- `layoutState` (collapsed, spanWide, fullscreen)
- any additional chrome-relevant metadata

chrome.js renders UI strictly from descriptor content.

Portal is responsible for keeping descriptors in sync when:
- instances are created or deleted
- names are edited
- order changes
- layout changes
- settings migrate

Descriptors are the single source of truth for gadget chrome.


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

## 4.1 Storage Persistance, Deletion & Movement
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

When Gadget Instances are renamed:

* The gadget needs to support moving their settings across the relevant namespace buckets.

## 4.2 Optional UX Enhancements (Non-Normative)

The following behaviors are **optional** and MAY be implemented by U:Ux to improve
the usability and polish of multi-instance gadget management. These guidelines are
informational only and do not affect the authoritative authoring contract.

**UX MAY:**

- **Auto-focus the new instance name field** immediately after the user clicks ➕  
  This allows instant renaming without requiring an additional click.

- Provide a **subtle vertical visual guide** connecting a class row and its instance
  rows (e.g., a faint dotted line or indentation marker).  
  This may improve clarity in dense dashboards but is not required for correctness.

Both enhancements should remain stylistically lightweight and must not modify
runtime behavior, descriptor semantics, or instance ordering logic.


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


## Multi-Instance Settings UI Contract (Authoritative, v1.2.x)

This section defines the canonical behavior of how Portal and chrome.js present and manage multi-instance gadgets in the Settings Manager.

### 1. Class Row (Parent Row)

Layout:

[ + ]   [Class Icon]   {Gadget Class Name}   [Badges…]   [↑] [↓]

Rules:

- Class row is not an instance (no checkbox).
- The ➕ button creates a new instance.
- Class-level badges represent class capabilities.
- Arrows [↑][↓] reorder the entire class block among other gadgets.
- Instance rows appear directly below their class.

### 2. Instance Rows

Layout:

[ – ]  [☐]  [Icon]  {Instance Name (editable)}   [Badges…]   [↑] [↓]

Rules:

- Remove (–) triggers a confirmation modal before deletion.
- Checkbox controls show/hide of that instance.
- Label → textbox on click (✓/✖/Enter/Escape semantics).
- Empty names are forbidden.
- Badges align with the global badge grid.
- Arrows reorder instances only within the class block.

### 3. Instantiation Rules

When the user presses ➕:

- Portal allocates a new instanceId.
- The default name is generated as:

  {Class Name} #nn

- A new instance row appears directly under the class row.
- The instance catalog is updated.
- A fresh descriptor is generated and passed to chrome.js.
- Namespace is created:

  vz:gadgets/{classId}/{instanceId}/*

### 4. Deletion Rules

Deleting an instance must:

- show a confirmation modal  
- delete the instance namespace  
- update the instance catalog  
- rebuild descriptors  
- refresh chrome  

### 5. Renaming Rules

- Click label → textbox.
- ✓ or Enter commits.
- ✖ or Escape cancels.
- Empty names are rejected.
- Renames update instance catalog + descriptors.

### 6. Reordering Rules

- Class arrows move entire class blocks.
- Instance arrows move only within their block.
- Ordering persists in settings.
- chrome.js must render the new order deterministically.

### 7. Badge Grid Alignment

All badges must align in a single fixed grid across:

- class rows
- instance rows
- single-instance gadgets

Badge order is canonical and derived from capability categories.


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
# 13. Portal Settings UI

  │      [☑] [icon] Class Name					  	[Badges]	[↕] [⚙️]
  │      [☐] [icon] Class Name						[Badges]	[↕] [⚙️]
  │      [☑] [icon] Class Name						[Badges]	[↕] [⚙️]
  │      [+] [icon] Class Name						[Badges]	[↕]			// Multi-instance gadget listing, clicking the [+] button ad another instance
  │      [–] [☑] [icon] Instance Name	[🖊️][✖️]	[Badges]	[↕] [⚙️]
  │      [–] [☑] [icon] Instance Name	[🖊️][✖️]	[Badges]	[↕] [⚙️]
  │      [–] [☑] [icon] Instance Name	[🖊️][✖️]	[Badges]	[↕] [⚙️]
  │      [☑] [icon] Class Name						[Badges]	[↕] [⚙️]
  │      [☑] [icon] Class Name						[Badges]	[↕] [⚙️]
  │      [–] [☑] [icon] Instance Name	[🖊️][✖️]	[Badges]	[↕] [⚙️]	// instance of multi-instance gadget that was moved [↕] away to a different rendering order away from its parent by tinkering with the up/down buttons
  │      [☑] [icon] Class Name						[Badges]	[↕] [⚙️]
  
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
