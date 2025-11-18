# 🌍 Atlas Specification — v1.2

**VizInt Shared Library Contract**
*(Implements System Spec v1.2 & Portal Spec v1.2 requirements)*

---

# 0. Purpose

Atlas is the **canonical provider of geographic context** within VizInt.
It is responsible for:

* Determining the user’s **location**
* Managing and persisting the **geo cache**
* Providing a clean, high-level API for gadgets requiring location
* Offering detailed **fallback and confidence rules**
* Providing lat/lon + tz to Chronus for **time-based computation**, without owning any DST logic

Atlas is part of the VizInt Shared Library stack and is injected into gadgets via:

```js
const { Atlas } = ctx.libs;
```

---

# 1. Ownership Model (Authoritative)

### 1.1 Atlas Owns:

* Geographic context
* Local geo cache
* Persistence to localStorage
* Fallback resolution rules
* Confidence model
* Refresh lifecycle

### 1.2 Atlas Does *Not* Own:

* DST status
* Time offsets
* Time anchors
* Any temporal computation

All DST/time behavior belongs exclusively to **Chronus**.

Atlas provides **place**.
Chronus provides **time**.

---

# 2. Installation & Injection (Portal Responsibilities)

The Portal MUST:

1. Instantiate Atlas **once at boot** before any gadget mount().
2. Expose it under `ctx.libs.Atlas` for all gadgets.
3. Capabilities serve as the **semantic contract**: only gadgets declaring `capabilities: ["atlas"]` are permitted to use Atlas.
4. A stricter injection-only-when-capable model may come in v1.3+.

Atlas becomes available to gadgets under:

```js
ctx.libs.Atlas
```

````

---

# 3. Public API Surface

Atlas exposes the following interface:

```js
Atlas.ready                 // Promise<void>

Atlas.getBestGeo()          // returns canonical geo object
Atlas.getCity()             // string | null
Atlas.getCountry()          // string | null
Atlas.getLatLon()           // { lat, lon } | null
Atlas.getTimeZone()         // IANA tz string | null
Atlas.getFallbackReason()   // null | "file-mode" | "permission-denied" | "offline" | "unknown"

Atlas.subscribe(handler)    // (geoObj)=>void → returns unsubscribe()
````

### 3.1 `Atlas.ready`

Resolves once Atlas computes its **first-pass geo object** (even if degraded).
Never rejects.
Never resolves twice.

---

# 4. Canonical Geo Object Shape

Atlas always returns an object with this schema:

```js
{
  city:       string | null,
  country:    string | null,        // ISO-3166 alpha-2 when known
  tz:         string | null,        // IANA zone
  lat:        number | null,
  lon:        number | null,

  confidence: "high" | "medium" | "low",
  fallback:   null
            | "file-mode"
            | "permission-denied"
            | "offline"
            | "unknown",

  source:     "device" | "ip" | "tz-only" | "manual" | "seed"
}
```

---

# 5. Persistence Model (Authoritative)

### 5.1 Storage Key

Atlas owns one localStorage key:

```
Vz:Atlas:GeoCache
```

### 5.2 Persisted Fields

Atlas persists **all fields**, including:

* `lat`, `lon`
* `city`, `country`, `tz`
* `confidence`, `fallback`, `source`
* timestamps (internal)

### 5.3 Confidence-Downgrading Rule

When loading cached data:

* `high → medium`
* `medium → low`
* `low → low`

This prevents stale precision after sleep, hibernation, or long gaps.

### 5.4 No Other Subsystem May Persist Geo

Portal, gadgets, and Chronus must **not** maintain shadow copies.

---

# 6. Geo Acquisition Pipeline (v1.2 Standard)

Atlas performs geo acquisition through the following **ordered pipeline**:

## 6.1 Environment Detection

Compute:

```js
isFileMode   = (location.protocol === "file:");
isOnline     = navigator.onLine !== false;
tzGuess      = Intl.DateTimeFormat().resolvedOptions().timeZone || null;
```

Pre-populate:

* `_geo.tz = tzGuess`
* If `isFileMode` → `fallback = "file-mode"`
* If `!isOnline` → `fallback = "offline"`

---

## 6.2 Base Fallback (Always Available)

When no better data is available:

1. Use `tzGuess`
2. Populate `city`/`country` from the **small curated TZ→city map**
3. Set:

   * `confidence = "low"`
   * `fallback = appropriate reason`
   * `source = "tz-only"`

This resolves quickly and is used for `Atlas.ready`.

---

## 6.3 Device Geo (Highest Confidence)

Atlas only attempts device geo when **all** are true:

* Secure context (`https:`)
* `navigator.permissions` exists
* Permission state is `"granted"`

If so:

1. Call `navigator.geolocation.getCurrentPosition()`
2. In parallel, call IP service (see below)
3. Combine:

   * lat/lon from device
   * city/country from IP
   * tz from browser

Set:

```
confidence = "high"
fallback   = null
source     = "device"
```

Atlas **never prompts**.
State `"prompt"` or `"denied"` → skip device geo.

---

## 6.4 IP-Based Geo (Medium Confidence)

Atlas uses the existing `ipApiJSONP()` (ipwho.is):

* Works over file, http, https
* Provides lat/lon + country + (optional) city

If successful:

```
confidence = "medium"
fallback   = (isFileMode ? "file-mode" : null)
source     = "ip"
```

Timeouts or failures fall back to tz-only.

---

## 6.5 Offline Mode

If `!navigator.onLine`:

* Use persisted cache
* Downgrade confidence
* Mark `fallback = "offline"`

If no cache available:

* Use base tz-only fallback.

---

# 7. Fallback Behavior Rules (v1.2 Canonical)

### 7.1 Under `file://`

Atlas must:

* **Never prompt for permission**
* Prefer cached geo
* Otherwise IP-based guess
* Otherwise tz-only

Atlas still participates in **adaptive refresh** when returning to visibility.

---

### 7.2 Under Permission Denied

* Never re-prompt
* Skip device geo
* Use IP/TZ
* Use cached geo when relevant

---

### 7.3 Under Offline

* Use cached geo
* If none, use tz-only
* Mark fallback appropriately

---

### 7.4 Under Success (Device Geo or IP Geo)

* Persist full geo.
* **If environment is normal:** set `fallback = null`.
* **If environment is inherently degraded** (`file://` or offline): preserve the environmental fallback reason (`"file-mode"` or `"offline"`).
* Record `source` and `confidence`.

---

# 8. Adaptive Refresh Strategy (v1.2)

Atlas MUST implement a **non-nagging**, **event-driven**, **low-frequency** refresh model.

## 8.1 Event-Driven Refresh

Refresh when:

* `document.visibilitychange` → visible
* `window.focus`
* `window.online`
* Detecting large system-time discontinuities

  * (e.g., sleep/hibernate resume)

Event triggers should only refresh when past the **minimum refresh interval**.

---

## 8.2 Low-Frequency Polling (Visible Only)

When the tab is visible, Atlas periodically evaluates:

* IF `now - lastGeoUpdate > MAX_GEO_AGE`

  * Then silently re-check geo (TZ/IP only unless device permission is granted)

Recommended defaults:

```
CHECK_INTERVAL = 2–3 minutes
MAX_GEO_AGE    = 10–30 minutes
```

---

# 9. Small Curated TZ→City Map

Atlas v1.2 includes a small set of canonical mapping entries for tz-only fallback:

Example entries (non-exhaustive):

```js
{
  "America/Los_Angeles": { city: "Los Angeles", country: "US" },
  "America/New_York":    { city: "New York",    country: "US" },
  "Europe/London":       { city: "London",      country: "GB" },
  "Europe/Paris":        { city: "Paris",       country: "FR" },
  "Africa/Cairo":        { city: "Cairo",       country: "EG" }


  ,
  "Asia/Dubai":        { city: "Dubai",       country: "AE" },
  "Asia/Riyadh":       { city: "Riyadh",      country: "SA" },
  "Asia/Tokyo":        { city: "Tokyo",       country: "JP" },
  "Asia/Singapore":    { city: "Singapore",   country: "SG" }
}
```

This list may grow in v1.3, but remains small in v1.2.

---

# 10. Chronus Interface Contract

Chronus owns **all time logic**.
Atlas owns **all geo logic**.

Gadgets combine them:

```js
await Atlas.ready;
const geo = Atlas.getBestGeo();

Chronus.computeAnchors({
    tz: geo.tz,
    latLon: { lat: geo.lat, lon: geo.lon }
});
```

### Atlas MUST NOT:

* compute DST
* compute UTC offsets
* compute transitions
* depend on Chronus internally

### Chronus MUST NOT:

* depend on Atlas internally
* maintain or cache geo state

All interaction must happen through gadget code.

---

# 11. Subscription Model

`Atlas.subscribe(handler)`:

* Registers a subscriber
* Called each time `_geo` changes
* Returns an `unsubscribe()` callback

Subscribers receive the **canonical geo object**.

---

# 12. Backward Compatibility

Atlas must provide a thin compatibility alias:

```js
window.getBestGeo = (...args) => Atlas.getBestGeo(...args);
```

This alias is **deprecated** and may be removed in v1.4+.

---

# 13. Implementation Notes (Informative, Not Normative)

* Device geo + IP geo may run in parallel
* All long-running tasks should use timeouts
* First-pass fallback should resolve quickly
* Multiple asynchronous updates may occur (TZ-only → IP → device)
* `Atlas.ready` resolves on **first valid geo**, not final refined geo
* Writes to `Vz:Atlas:GeoCache` should be throttled (e.g., once per 10 minutes)

---

# 14. Security & Privacy (v1.2 Level)

Atlas persists full lat/lon as approved.
No user-facing privacy controls exist in v1.2.
These may be introduced in v1.3+.

---

# 15. Versioning

This document defines **Atlas v1.2**.
Future versions must follow the Volk Protocol (FRTP) and be forward-compatible with System Spec & Portal Spec.

---

# END OF ATLAS SPEC v1.2
