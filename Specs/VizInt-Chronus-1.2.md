# VizInt Chronus v1.2 — Complete Specification

> **Role:** U:Chronus — Time, DST, Anchors, Providers, Sequencer
> **Status:** v1.2.3 (Implementation-Ready)
> **Scope:** Chronus Core Library used by all VizInt Gadgets under System/Portal v1.2
> **Tabs:** Hard tabs only

## VERSIONING & HISTORY (#code:history compliant)

/*==============================================================================
	VizInt – Chronus Core Specification
	$VER: 1.2.3
	$AUTHOR: VizInt Volk
	$COPYRIGHT: (c) 2024–2025 K&Co.

	$HISTORY:
	2025/11/19	-	1.2.3	Added backlog section (runner/blender internalization), Atlas pull-model updates, merged older spec elements, clarified ctx.libs-only Atlas wiring and provider readiness semantics, clarified ctx.libs-only Atlas wiring and provider readiness semantics.
	2025/11/18	-	1.2.2	Integrated DST ownership clarifications, Atlas pull-model,
							GeoEnvelope semantics, migration rules, provider spec.
							Added provider contract, refined context/cursor model.
	2025/11/18	-	1.2.1	Added Chronus v1.2 public API facade (DST, providers,
							sequencer, context/cursor); added legacy-warn rules.
	2025/11/10	-	1.2.0	Moved to VizInt System/Portal 1.2 architecture.
	2025/11/10	-	1.1.1	Added sequencer storage.
	2025/11/01	-	1.1.0	Added multi-context model.
	2025/10/30	-	1.0.0	Initial extraction.
==============================================================================*/

---

# 1. Overview

Chronus is the **authoritative Time Subsystem** for VizInt. It provides:

* Accurate wall-clock time
* DST logic and UTC offset resolution
* Anchor computation via providers (civil, prayerTimes, future providers)
* Contexts and cursors for per-location time navigation
* Global sequencer for multi-step timelines
* A stable library API for all gadgets

Chronus integrates with **Atlas** (geo pipeline) using a **pull-model**.

* Chronus requests geo as needed via an injected Atlas library instance.
* Atlas never pushes geo into Chronus.

Chronus supports both:

* `ctx.libs.Chronus` (canonical library surface for gadgets)
* `window.Chronus` (legacy debug shim, with warnings)

Globals are legacy only. They are not the authoritative IPC boundary in v1.2.

---

# 2. Design Principles

1. **Chronus owns time.** DST, offsets, now(), transitions, day boundaries.
2. **Atlas owns geography.** TZ, lat/lon, confidence, fallback.
3. **Chronus pulls geo when needed.** One-way dependency from Chronus to Atlas by injection.
4. **Providers compute anchors.** Chronus orchestrates, providers compute.
5. **Contexts separate time views.** Each context has its own cursor and anchor set.
6. **Sequencer is global in v1.2, scoped later.**
7. **Legacy APIs work but warn.** Migration to v1.2+ APIs is encouraged.
8. **No hard dependency on globals.** Chronus does not need `window.Atlas` or `window.Chronus` for correctness.

---

# 3. Chronus v1.2 Responsibilities

Planned dependency chain:

```
Core → Atlas → Chronus → Gadgets
```

Chronus MUST:

* Provide DST-resolved time APIs.
* Load built-in providers (civil, prayerTimes).
* Expose a provider registry.
* Compute anchors using providers.
* Maintain per-context cursors.
* Provide a global sequencer store.
* Expose `Chronus.ready` to signal readiness.
* Support optional geo inputs and default to `Atlas.getBestGeo()` when Atlas is available.
* Work fully offline and when loaded from the local file system (`file://`).
* Allow provider-specific configs (madhab, method, etc.).
* Encapsulate provider initialization. Provider readiness is covered by `Chronus.ready` and not exposed per provider in the public API.

Chronus MUST NOT:

* Write to Atlas caches.
* Subscribe to Atlas events.
* Persist geo inputs outside ephemeral context memory.
* Expose internal context or anchor caches as public API promises.
* Depend on any gadget state.
* Depend on `window.Atlas` or other globals for correctness. Any globals are debug only.

Gadgets MUST:

* Reach Chronus via `ctx.libs.Chronus`, not `window.Chronus`, in all new or migrated code.

---

# 4. Public API Surface

## 4.1 Time and DST

```js
Chronus.nowUTC(): Date
Chronus.nowInTZ(tz: string): Date
Chronus.getOffset(tz: string, at?: Date): number  // minutes offset from UTC
Chronus.getDSTInfo(tz: string, at?: Date): {
	inDST: boolean,
	offsetMinutes: number,
	nextTransition: Date|null,
	prevTransition: Date|null
}
Chronus.getDayBounds(tz: string, date?: Date): { start: Date, end: Date }
```

DST rules come from:

* `Intl.DateTimeFormat().resolvedOptions().timeZone` (runtime)
* Bounded search for transitions

**DST Implementation Constraints**

DST is owned by Chronus, and:

* Use `Intl.DateTimeFormat` as the base truth.
* Use bounded transition search (for example within ±1 year).
* No tzdata shipping in v1.2.
* Must document limitations.
* Must be predictable and deterministic within a runtime.

---

## 4.2 Provider Registry

```js
Chronus.registerProvider(name: string, impl: Provider)
Chronus.getProvider(name: string): Provider|null
Chronus.listProviders(): string[]
```

Provider contract:

```ts
type Provider = {
	name: string,
	init?(): Promise<void>,  // optional, internal to Chronus.ready
	computeAnchors(options: {
		geo: GeoEnvelope,
		date: Date,
		contextId?: string,
		// provider-specific options...
	}): Promise<ChronusAnchor[]>
};
```

Notes:

* `init` is optional and is considered an internal concern. Chronus.ready encapsulates provider readiness.
* Providers do not expose their own `ready` promises in the public API in v1.2.

Built-in providers:

* `civil` – day bounds, “today”, sunrise/sunset, etc.
* `prayerTimes` – prayer anchors; sunrise/sunset may come from `civil` or `prayerTimes` depending on implementation.

Chronus should offer intelligent de-duplication options if multiple providers provide essentially the same event (such as sunset and maghrib) - starting with user-preference based de-duping, and then evolving to more intelligent options in the future.

---

## 4.3 Anchors

### 4.3.1 Anchor Type Taxonomy

* **Atomic Anchors**

  * A single timestamp, for example Fajr, Sunrise, Noon.

* **Composite Anchors**

  * Derived from others, for example Next Prayer, Golden Hour.

* **Recurring Anchors**

  * Anchors that always fire daily (prayerTimes, civil).

* **Volatile Anchors**

  * Anchors dependent on short-term conditions (weather, astronomy, etc.).

* **User-defined Anchors**

  * Arbitrary gadget-defined timestamps.

### 4.3.2 Computation (Canonical Front Door)

```js
Chronus.getAnchors({
	provider?: string,      // default: "civil" or provider default
	geo?: GeoEnvelope,      // optional — if missing, Chronus pulls from Atlas
	date?: Date,            // default: today
	contextId?: string|null
	// provider-specific options...
}): Promise<ChronusAnchor[]>
```

Provider-centric semantics:

* If `geo` is provided, Chronus uses it directly.

* If `geo` is missing and Atlas is available, Chronus performs:

  ```js
  const geo = await Atlas.getBestGeo();
  ```

* If Atlas is not available (for example pure file mode), Chronus falls back to a tz-only envelope using the runtime time zone.

* Chronus may internally persist anchors in its context store.

* Externally, `getAnchors()` is treated as pure: same input gives the same logical output, subject to time and geo changes.

Semantics and migration:

* `getAnchors()` is the universal front door for provider work.
* Legacy APIs remain but warn.
* v1.3 will formally deprecate legacy context-style entry points.

---

## 4.4 Contexts and Cursors

Chronus maintains contexts:

```ts
type Context = {
	id: string,
	anchors: Map<string, ChronusAnchor[]>, // frame → anchors
	cursor: Date,
	geo?: GeoEnvelope | null
};
```

Public cursor APIs in v1.2:

```js
Chronus.listContexts(): ContextSummary[]
Chronus.getCursor(contextId: string): Date
Chronus.setCursor(contextId: string, date: Date): void
Chronus.jump(contextId: string, delta: { days?: number, hours?: number, minutes?: number }): void
```

Contexts are created automatically when anchor computation occurs. These cursor APIs are used by Runway, Runner, Blender, and multi-city dashboards to keep per-view time navigation consistent.

---

# 5. Geo Envelope (Atlas v1.2)

Chronus accepts a GeoEnvelope shaped as defined by Atlas v1.2:

```ts
type GeoEnvelope = {
	city: string|null,
	country: string|null,
	tz: string|null,
	lat: number|null,
	lon: number|null,
	confidence: "high" | "medium" | "low",
	fallback: null | "file-mode" | "permission-denied" | "offline" | "unknown",
	source: "device" | "ip" | "tz-only" | "manual" | "seed"
};
```

Rules:

* If provided: use it directly.
* If omitted and Atlas is available: Chronus calls `Atlas.getBestGeo()`.
* If `geo.tz` is missing, fallback to the system time zone.
* If lat/lon is missing, prayer-based providers operate in degraded mode.
* Never mutate or persist the envelope.
* Chronus may keep ephemeral snapshots inside contexts only (non-persistent).

---

# 6. Sequencer (v1.2 Global Library)

Sequencer is global and stored under `chronus.sequences.v1`.

API:

```js
const seq = Chronus.getSequencer();
seq.getSequences(): Sequence[]
seq.upsertSequences(list: Sequence[]): void
seq.deleteSequences(ids: string[]): void
```

Sequence structure:

```ts
type Sequence = {
	id: string,
	label: string,
	steps: Array<{
		stepId?: string,
		description: string,
		minutes?: number,
		mode?: "fg" | "bg"
	}>
};
```

Sequencer is a shared library in v1.2 (portal-level), not per-gadget or per-context. Future versions may support scoped sequences.

---

# 7. Legacy API Compatibility

Legacy globals remain available for migration:

```js
Chronus.upsertAnchors(...)
Chronus.getAnchors({ contextId, frame })  // legacy style
Chronus.addContext(...)
Chronus.listContexts()
```

Each logs a one-time warning:

```text
[Chronus] Legacy API used: X — will be deprecated in v1.3. Please migrate to Chronus.getAnchors() and Chronus.getSequencer().
```

Notes:

* These legacy APIs are exposed through the same Chronus object that is injected into `ctx.libs.Chronus`.
* `window.Chronus` may point to the same object for debugging, but gadgets should not rely on the global in new code.

Legacy behavior remains stable for all existing gadgets in v1.2.

---

# 8. Integration with Atlas (Updated Contract)

Chronus v1.2 uses a pull model and an injected Atlas library instance.

Chronus does not know about `ctx.libs` directly; Portal wires Atlas and Chronus together and can conceptually be seen as doing something like:

```js
// Portal wiring (conceptual)
const Atlas   = makeAtlas();
const Chronus = makeChronus({ Atlas });

// Later, for gadgets:
ctx.libs = { Core, Atlas, Chronus, Nexus };
```

Inside Chronus, integration looks like:

```js
async function refreshFromAtlas() {
	if (!Atlas || !Atlas.getBestGeo) return;
	const geo = await Atlas.getBestGeo();
	await Chronus.computeAnchorsFromGeo(geo); // internal helper, not public API
}

// Called during init and on internal refresh cadence
await Atlas.ready; // if Atlas is present
await refreshFromAtlas();
Chronus.onInternalRefresh(refreshFromAtlas);
```

Rules:

* Chronus may depend on Atlas via an injected module reference.
* Chronus does not read `window.Atlas` for correctness.
* Chronus does not write to Atlas or its caches.
* Chronus must not assume high precision geo.
* Chronus must degrade gracefully when Atlas is absent or degraded.

---

# 9. Readiness Lifecycle

`Chronus.ready` performs an initial geo pull (when Atlas is present) and at least one anchor computation in its default context, so gadgets can assume a warm cache.

`Chronus.ready` resolves when:

* Core Chronus structures are initialized.
* Built-in providers are registered.
* Provider initialization (for example provider.init) has completed as needed.
* Sequencer storage is available.
* `Atlas.ready` (if an Atlas instance was injected) has resolved or timed out into a degraded but non-hanging state.

`Chronus.ready` must not hang on degraded inputs.

Providers do not expose their own readiness to gadgets. Provider initialization is an implementation detail covered by `Chronus.ready`.

---

# 10. Internal Architecture

Chronus includes these internal subsystems:

### 10.1 Time Core

* now()
* offset()
* DST transition search
* local/UTC conversion

### 10.2 Context Manager

* Map<contextId → context>
* Anchor store per frame
* Cursor per context

### 10.3 Provider Engine

* Registry per provider name
* Adapter for provider API
* Invocation logic for `computeAnchors`

### 10.4 Sequencer Engine

* Global store in localStorage
* Upsert/delete/filter

### 10.5 Legacy Compatibility Layer

* Window global surface (optional)
* Warning emissions

---

# 11. Backlog (v1.3 and Beyond)

### 11.1 Integrate Runner and Blender Inside Chronus

Move existing `runner.js` and `blender.js` into Chronus core:

* Unified scheduling engine.
* Unified time-window blending.
* Shared cursor semantics.
* Nexus-based update triggers.

### 11.2 Cursor API Expansion

* Shared cursors across gadgets.
* Lock/hold/release semantics.
* Cursor observers and subscription hooks.

### 11.3 Provider Families

* Calendars.
* Regional schedules.
* Habit and event engines.

### 11.4 Enhanced Atlas Cooperation

* Explicit GeoEnvelope diffing.
* Multi-city parallel contexts.
* Time travel debugging hooks.

---

# END OF SPEC
