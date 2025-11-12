# 🧭 VizInt Gadget API v1.0

> **For Humans and AIs:**
> This document defines the official structure of a VizInt-compatible gadget (v1.0 API).
> It explains how gadgets register themselves, declare metadata, and interact with the portal.

---

## 1. Overview

A **VizInt gadget** is a self-contained JavaScript module that exports one object into
`window.GADGETS[<id>]`.

Gadgets run entirely client-side (no frameworks; pure HTML/CSS/JS).
They can optionally declare their **manifest** (metadata block) to identify themselves to the portal,
and provide one required function: `mount(host, ctx)`.

---

## 2. Minimal Lifecycle

| Stage           | Description                                                                      |
| :-------------- | :------------------------------------------------------------------------------- |
| **Discovery**   | The registry or scanner loads gadget scripts and checks for a `manifest` object. |
| **Mounting**    | When enabled, VizInt creates a container element and calls `mount(host, ctx)`.   |
| **Persistence** | Gadget state (settings, collapsed/fullscreen, etc.) is handled by the portal.    |
| **Unmounting**  | (Optional) A gadget can define `unmount()` for cleanup when disabled.            |

---

## 3. Manifest Fields

Every v1.0 gadget defines:

```js
const manifest = {
  _api: "1.0",                // API version (mandatory)
  _class: "Clock",            // Gadget class (mandatory, logical category)
  _type: "singleton",         // "singleton" | "instantiable"
  _id: "Local",               // Unique id for this instance
  _ver: "v0.1.0",             // Gadget’s own version number (mandatory)
  verBlurb: "Initial release supporting Chronus/Atlas.",
  bidi: "ltr",                // Text direction: "ltr" (default) or "rtl"

  label: "Clock (Local Time)", // User-friendly title
  publisher: "K&Co.",          // Optional
  contact_email: "",           // Optional
  contact_url: "",             // Optional
  contact_socials: "",         // Optional (e.g. "x:@vizint; ig:@vizint")

  // Visuals
  iconEmoji: "🕰️",             // Optional emoji shown in titlebar/settings
  iconPng: "",                 // Optional .png URL or relative path
  iconBg: "rgba(0,0,0,.2)",    // Optional background color
  iconBorder: "#888",          // Optional border color

  // Capabilities (preload helpers)
  capabilities: ["chronus", "atlas", "network"],

  description:
    "Displays current local time and date, auto-detecting timezone using Chronus.",

  // Optional defaults for future instancing
  defaults: {},
  propsSchema: {},
};
```

### Mandatory fields

* `_api`
* `_class`
* `_type`
* `_id`
* `_ver`
* at least one exported function (`mount()`)

All others are optional but recommended for discoverability.

---

## 4. Capabilities

The array `capabilities` hints which shared subsystems to preload and badge:

| Capability  | Purpose                                        |
| ----------- | ---------------------------------------------- |
| `"chronus"` | Needs time/date/tz helpers (Chronus provider)  |
| `"atlas"`   | Needs geolocation helpers (Atlas provider)     |
| `"network"` | Fetches remote APIs (not pure offline)         |
| `"served"`  | Must be served via HTTP/HTTPS (not `file:///`) |

---

## 5. Context Object (`ctx`)

When VizInt calls `mount(host, ctx)`, it passes a context providing helpers and state.

| Key                    | Type               | Description                                                     |
| ---------------------- | ------------------ | --------------------------------------------------------------- |
| `ctx.getSettings()`    | `() => object`     | Returns current persisted settings.                             |
| `ctx.setSettings(obj)` | `(object) => void` | Updates persisted settings (merged).                            |
| `ctx.shared`           | `object`           | Shared libraries (`Chronus`, `Atlas`, etc.)                     |
| `ctx.env`              | `object`           | Environment info (`theme`, `isDark`, `foldedHubControls`, etc.) |
| `ctx.name`             | `string`           | Gadget’s internal id (e.g. `"Clock:Local"`)                     |
| `ctx.host`             | `HTMLElement`      | The container element created by VizInt.                        |

---

## 6. Example: Blank Gadget Template

```js
(function(){

  // === Manifest ===
  const manifest = {
    _api: "1.0",
    _class: "Hello",
    _type: "singleton",
    _id: "World",
    _ver: "v0.0.1",
    verBlurb: "First VizInt 1.0 gadget example.",
    bidi: "ltr",
    label: "Hello World (VizInt)",
    capabilities: [],
    description: "Demonstrates the VizInt Gadget API v1.0.",
    iconEmoji: "👋",
    iconBg: "rgba(255,255,255,0.08)",
    iconBorder: "rgba(255,255,255,0.2)"
  };

  // === Main mount function ===
  function mount(host, ctx) {
    host.innerHTML = `
      <div style="padding:6px;">
        <p>Hello, VizInt! 👋</p>
        <p>Your gadget class is: <b>${manifest._class}</b></p>
      </div>
    `;
  }

  // === Optional cleanup ===
  function unmount(host, ctx) {
    host.innerHTML = "";
  }

  // === Export to VizInt ===
  window.GADGETS = window.GADGETS || {};
  window.GADGETS[manifest._class.toLowerCase()] = { manifest, mount, unmount };

})();
```

---

## 7. Backward Compatibility

Gadgets **without** `_api: "1.0"` are treated as *legacy*:

* `_class` inferred from file name.
* `_type` defaults to `"singleton"`.
* `_id` defaults to `"Main"`.
* `bidi` defaults to `"ltr"`.
* The system attempts to mount them if they export `window.GADGETS[name].mount()`.

---

## 8. Testing Your Gadget

1. Place your `.js` file in `/gadgets/`.
2. Reload the portal and open the **Settings** gadget.
3. Your gadget should appear with its icon and badges.
4. Toggle it ON, and it will render live.

---

## 9. Versioning & Registry

Each gadget version should bump `_ver` and optionally update `verBlurb`.
The VizInt **History widget** reads these values to display changelogs.

---

## 10. Good Practices

* Keep all visual logic self-contained.
* Reuse CSS variables from `common.css`.
* Use `ctx.shared.Chronus` / `ctx.shared.Atlas` if you declare those capabilities.
* Always clean up event listeners in `unmount()`.

---

## 11. Migration Guide (Legacy → 1.0)

| Step | Action                                                                                         |
| ---- | ---------------------------------------------------------------------------------------------- |
| 1    | Add a `manifest` block at the top with `_api:"1.0"`, `_class`, `_ver`, and `_id`.              |
| 2    | Rename your export to lowercase `_class`: `window.GADGETS['classname'] = { manifest, mount };` |
| 3    | Remove old global dependencies (like `window.gadgetInfo`).                                     |
| 4    | Migrate any manual theme logic to use `ctx.env.isDark`.                                        |
| 5    | Declare `capabilities` if you rely on shared services (Chronus, Atlas, etc.).                  |

---

## 12. Prompt for AIs

> *You are writing or refactoring a VizInt gadget.*
> Follow the [VizInt Gadget API v1.0](./VizInt_Gadget_API_v1.0.md).
> Always export a manifest, a `mount()` function, and (optionally) `unmount()`.
> Respect `ctx.shared` and `ctx.setSettings()`.
> Never assume server access unless `capabilities` includes `"network"`.
> Prefer reusing CSS variables and existing UI patterns.

---

*Last updated: 2025-11-11*
