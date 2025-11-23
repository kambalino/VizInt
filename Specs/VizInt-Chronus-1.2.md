# VizInt — Chronus v1.2 Specification

**Subsystem:** Time, DST, Anchors, Sequencer
**Owner:** U:Chronus
**Last Updated:** 2025-11-18
**Status:** Final Draft (Ready for Orchestrator consolidation)

---

## 0. PURPOSE & POSITION IN SYSTEM

Chronus is the **canonical time engine** of VizInt.
Its responsibilities: **time, DST, anchors, sequences, cursors**.
Its job is to give **all gadgets** a stable interface for:

* “What time is it in this timezone?”
* “What are today’s anchors (sunrise, prayers, civic times, etc.)?”
* “How do I navigate forward/backward in time?”
* “How do I work with sequences (timelines, recipes, countdown steps)?”

Chronus sits between:

```
Core → Atlas → Chronus → Gadgets
```

**Atlas = place** (geo, tz, lat/lon)
**Chronus = time** (DST, computation, anchors, sequences)

Chronus does **not** compute geolocation.
Chronus *consumes* Atlas.

---

## 1. VERSIONING & HISTORY (#code:history compliant)

```md
/*==============================================================================
	VizInt – Chronus Core Specification
	$VER: 1.2.2
	$AUTHOR: VizInt Volk
	$COPYRIGHT: (c) 2024–2025 K&Co.

$HISTORY:
	2025/11/18	1.2.2	Integrated DST ownership clarifications, Atlas pull-model,
					GeoEnvelope semantics, migration rules, provider spec.
	2025/11/18	1.2.1	Added Chronus v1.2 public API facade (DST, providers,
					sequencer, context/cursor); added legacy-warn rules.
	2025/11/10	1.2.0	Moved to VizInt System/Portal 1.2 architecture.
==============================================================================*/
```

---

## 2. SCOPE OF CHRONUS v1.2

### Chronus MUST:

✓ Provide canonical time computation
✓ Own DST logic
✓ Compute anchors via providers
✓ Own the sequencer (global scope)
✓ Maintain contexts & cursors
✓ Provide a stable library API under `ctx.libs.Chronus`
✓ Allow optional provider-specific configs (e.g., madhab, method)
✓ Work fully offline (`file://`)

### Chronus MUST NOT:

✗ Persist or shadow Atlas’s geo database
✗ Call back into Atlas with mutations
✗ Expose internal context/anchor caches as public API promises
✗ Depend on any gadget state

---

## 3. ARCHITECTURAL MODEL (Authoritative)

### 3.1 One-Way Dependency

Chronus depends on **Atlas**.
Atlas must **never** depend on Chronus.

```
Atlas → Chronus → Gadgets
```

Chronus pulls geo during:

* startup (via Chronus.ready)
* explicit getAnchors() calls
* internal refresh cadence (e.g., hourly, after DST changes, after midnight rollover)

---

## 4. GEOENVELOPE (ATLAS v1.2 INPUT MODEL)

Chronus accepts a `GeoEnvelope` object as *optional* input.

```ts
type GeoEnvelope = {
	city:       string | null;
	country:    string | null;    // ISO-3166 alpha-2
	tz:         string | null;    // IANA timezone
	lat:        number | null;
	lon:        number | null;

	confidence: "high" | "medium" | "low";
	fallback:   null | "file-mode" | "permission-denied" | "offline" | "unknown";

	source:     "device" | "ip" | "tz-only" | "manual" | "seed";
};
```

### Chronus rules:

* If provided → **use it directly**
* If omitted → **Chronus MUST call `Atlas.getBestGeo()`**
* Never mutate or persist GeoEnvelope
* May store ephemeral snapshots **inside contexts only**, non-persistent

---

## 5. DST RESPONSIBILITY (v1.2 Canonical Rules)

### Chronus owns DST.

Atlas **only** tells Chronus *which timezone* to use (`tz`).
Chronus performs all DST calculations, including:

* is DST in effect?
* next DST transition
* previous DST transition
* offsets at arbitrary timestamps

### Implementation (v1.2 constraints):

➡ **Use `Intl.DateTimeFormat` as base truth**
➡ Use a **bounded transition search** (±1 year)
➡ No tzdata shipping in v1.2
➡ Must document limitations
➡ Predictable & deterministic behavior inside same runtime

---

## 6. PROVIDER MODEL

Chronus v1.2 owns a **plugin-like provider registry**.

### Provider registration:

```js
Chronus.registerProvider(name, impl);
Chronus.getProvider(name);
Chronus.listProviders();
```

### Provider contract:

```ts
interface ChronusProvider {
	name: string;
	init?(): Promise<void>;
	ready?: Promise<void>;
	computeAnchors(options: {
		geo: GeoEnvelope;
		date: Date;
		// provider-specific options
	}): Promise<ChronusAnchor[]>;
}
```

### Built-in providers (v1.2):

| Provider        | Responsibility                       |
| --------------- | ------------------------------------ |
| **civil**       | day bounds, “today”, sunrise/sunset* |
| **prayerTimes** | prayer anchors                       |

* Sunrise/sunset may be delivered by civil **or** prayerTimes depending on implementation.

---

## 7. ANCHORS API (Canonical v1.2 API)

### The new, universal API:

```js
const anchors = await Chronus.getAnchors({
	provider: "prayerTimes",   // or "civil"
	geo,                       // optional → defaults to Atlas.getBestGeo()
	date: new Date(),          // optional
	contextId: "optional",     // does not affect semantics externally
});
```

### Semantics:

* Pure from gadget’s perspective
* Same input → same output
* Internally Chronus may cache anchors in context store
* Legacy APIs (`upsertAnchors`, `getAnchors(contextId, frame)`) remain but show **console.warn**
* v1.3 will formally deprecate them

---

## 8. CONTEXT & CURSOR MODEL

Chronus maintains **contexts** internally:

```
contextId → { cursor, geo, internalCache }
```

### Cursors

Chronus exposes **cursor manipulation** internally v1.2
Full public cursor API deferred to v1.3.

Internal capabilities (v1.2):

```ts
getCursor(contextId): Date
setCursor(contextId, date: Date)
jump(contextId, { days?, hours?, minutes? })
```

Used by Runway, Runner, Blender, and potentially multi-city dashboards.

---

## 9. SEQUENCER (GLOBAL SCOPE)

Sequencer is **global**, not per-gadget or per-context.

### API:

```js
const seq = Chronus.getSequencer();

// Manage sequences
seq.getSequences()
seq.upsertSequences([...])
seq.deleteSequences([...])
```

### Requirements:

* Backward compatible with existing sequencer
* Chronus v1.2 may provide adapters and wrappers
* v1.3 may add scoping

---

## 10. CHRONUS.READY SEMANTICS

Chronus.ready MUST resolve when:

1. Core structures are initialized
2. Providers are registered
3. Provider init() calls completed
4. Sequencer storage available
5. Atlas is ready (Chronus MUST `await Atlas.ready`)
6. Chronus performs an initial geo pull + anchor computation

Chronus.ready MUST NOT hang.

---

## 11. LEGACY API RULES (MANDATORY)

Chronus must maintain `window.Chronus` **only for backward compatibility**.

### Legacy API warnings:

When any of these are called:

* `Chronus.upsertAnchors`
* `Chronus.getAnchors({ contextId, frame })`
* `Chronus.addContext`
* `Chronus.listContexts()`

Chronus must issue (once per symbol):

```
console.warn("[Chronus] Legacy API used: upsertAnchors(). This will be removed in v1.3. Use getAnchors() instead.");
```

---

## 12. FILE-MODE & window.Chronus / window.Atlas

### Rules:

* Chronus must maintain `window.Chronus` for compatibility
* **Atlas does NOT get mirrored to window.Atlas**

  * No global `window.Atlas` object
  * All gadgets use `ctx.libs.Atlas`
  * File-mode Atlas is injected by Portal, not placed on window

This is now the canonical rule.

---
