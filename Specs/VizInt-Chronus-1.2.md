# VizInt Chronus v1.2 — Complete Specification

> **Role:** U:Chronus — Time, DST, Anchors, Providers, Sequencer
> **Status:** v1.2.3 (Implementation-Ready)
> **Scope:** Chronus Core Library used by all VizInt Gadgets under System/Portal v1.2
> **Tabs:** Hard tabs only

## VERSIONING & HISTORY (#code:history compliant)

/*==============================================================================
	VizInt – Chronus Core Specification
	$VER: 1.2.2
	$AUTHOR: VizInt Volk
	$COPYRIGHT: (c) 2024–2025 K&Co.

$HISTORY:
	2025/11/19	-	1.2.3	Added backlog section (runner/blender internalization), Atlas pull-model updates, merged older spec elements.
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

- Accurate wall-clock time
- DST logic and UTC offset resolution
- Anchor computation via providers (civil, prayerTimes, future providers)
- Contexts and cursors for per-location time navigation
- Global sequencer for multi-step timelines
- A stable library API for all gadgets

Chronus integrates with **Atlas** (geo pipeline) using a **pull-model** — Chronus requests geo as needed; Atlas never pushes.

Chronus supports both:
- `ctx.libs.Chronus` (canonical)
- `window.Chronus` (legacy, with warnings)

---

# 2. Design Principles

1. **Chronus owns time.** DST, offsets, now(), transitions, day boundaries.
2. **Atlas owns geography.** TZ, lat/lon, confidence, fallback.
3. **Chronus pulls geo when needed.** Never subscribes to Atlas.
4. **Providers compute anchors.** Chronus orchestrates, providers compute.
5. **Contexts separate time views.** Each context has its own cursor & anchor set.
6. **Sequencer is global in v1.2, scoped later.**
7. **Legacy APIs work but warn.** Migration to v1.2+ APIs encouraged.

---

# 3. Chronus v1.2 Responsibilities

This is the planned dependency chain:
	Core → Atlas → Chronus → Gadgets

Chronus MUST:
- Provide DST-resolved time APIs.
- Load built-in providers (civil, prayerTimes).
- Expose a provider registry.
- Compute anchors using providers.
- Maintain per-context cursors.
- Provide a global sequencer store.
- Expose `Chronus.ready` to signal readiness.
- Support optional geo inputs and default to `Atlas.getBestGeo()`.
- Work fully offline and when loaded from the local file system (`file://`)
- allow provider-specific configs (madhab, method, etc.)

Chronus MUST NOT:
- Write to Atlas caches.
- Subscribe to Atlas events.
- Persist geo inputs outside ephemeral context memory.
-  expose internal context/anchor caches as public API promises
-  NOT depend on any gadget state

---

# 4. Public API Surface

## 4.1 Time & DST
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
- `Intl.DateTimeFormat().resolvedOptions().timeZone` (runtime
- Bounded search for transitions


DST Implementation Constraints
DST is owned by Chronus, and:
 - Use Intl.DateTimeFormat as the base truth
 - Use bounded transition search (±1 year)
 - No tzdata shipping in v1.2
 - Must document limitations
 - Must be predictable & deterministic within a runtime

---

## 4.2 Provider Registry
```js
Chronus.registerProvider(name: string, impl: Provider)
Chronus.getProvider(name: string): Provider|null
Chronus.listProviders(): string[]
```

Provider Contract:
```ts
type Provider = {
	name: string,
	init?(): Promise<void>,  // optional
	computeAnchors(options: {
		geo: GeoEnvelope,
		date: Date,
		contextId?: string,
		...providerSpecific
	}): Promise<ChronusAnchor[]>
};
```

Explicit provider interface including optional ready/init() and a provider table documenting built-in providers:

 - civil – day bounds, “today”, sunrise/sunset, etc.
 - prayerTimes – prayer anchors; sunrise/sunset may come from civil or prayerTimes depending on implementation.

 Chronus should offer intelligent de-dupe options if multiple providers provide essentially the same event (such as sunset & maghreb) - starting off with user-preference based de-duping, and then evolving to other more intelligent options in the future.
---

## 4.3 Anchors
### 4.3.1 Anchor Type Taxonomy
 - Atomic Anchors
	- A single timestamp, e.g. Fajr, Sunrise, Noon

 - Composite Anchors
	- Derived from others, e.g. Next Prayer, Golden Hour

 - Recurring Anchors
	- Anchors that always fire daily (prayerTimes, civil)

 - Volatile Anchors
	- Anchors dependent on short-term conditions (weather, astronomy, etc.)

 - User-defined Anchors
	- Arbitrary gadget-defined timestamps
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
- If `geo` missing → Chronus performs:
```js
const geo = await Atlas.getBestGeo();
```
- Chronus may internally persist anchors in context store.
- Externally, `getAnchors()` is pure: same input → same logical output.

Semantics & Migration
 - getAnchors() is the universal front door.
 - Externally, getAnchors() is pure from gadget perspective; same input → same output.
 - Explicit migration note:
 	- Legacy APIs remain but warn,
 	- v1.3 will formally deprecate them.

---

## 4.4 Contexts & Cursors

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
Chronus.getCursor(contextId): Date
Chronus.setCursor(contextId, date: Date): void
Chronus.jump(contextId, delta: { days?: number, hours?: number, minutes?: number }): void
```

Contexts are created automatically when anchor computation occurs. These cursor APIs are used by Runway, Runner, Blender, and multi-city dashboards to keep per-view time navigation consistent.

---

# 5. Geo Envelope (Atlas v1.2)

Chronus accepts:
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
 - If provided: use it directly
 - If omitted: MUST call Atlas.getBestGeo()
 - If `geo.tz` missing → fallback to system tz.
 - If lat/lon missing → prayer-based providers operate in degraded mode.
 - Never mutate or persist the envelope
 - MAY keep ephemeral snapshots inside contexts only, non-persistent

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

---

# 7. Legacy API Compatibility

Legacy globals remain available:
```js
Chronus.upsertAnchors(...)
Chronus.getAnchors({ contextId, frame })  // legacy style
Chronus.addContext(...)
Chronus.listContexts()
```

Each logs a **one-time** warning:
```
[Chronus] Legacy API used: X — will be deprecated in v1.3. Please migrate to Chronus.getAnchors().
```

Legacy behavior remains stable for all existing gadgets.

---

# 8. Integration with Atlas (Updated Contract)

Chronus v1.2 uses **pull model**:

```js
await Atlas.ready;

function refresh() {
	const geo = Atlas.getBestGeo();
	Chronus.computeAnchorsFromGeo(geo);
}

refresh();
Chronus.onInternalRefresh(refresh);
```

Rules:
- Chronus MAY depend on Atlas.
- Chronus MUST NOT write to Atlas.
- Chronus MUST NOT assume high precision geo.
- Chronus MUST degrade gracefully.

---

# 9. Readiness Lifecycle

Chronus.ready performs an initial geo pull and at least one anchor computation in its default context, so gadgets can assume a warm cache.

`Chronus.ready` resolves when:
- Core structures initialized.
- Built-in providers are registered.
- Sequencer storage available.
- Atlas.ready (if Atlas present) has resolved.

Chronus.ready MUST NOT hang on degraded inputs.

---

# 10. Internal Architecture

Chronus includes these internal subsystems:

### 10.1 Time Core
- now()
- offset()
- DST transition search
- local/UTC conversion

### 10.2 Context Manager
- Map<contextId → context>
- Anchor store per frame
- Cursor per context

### 10.3 Provider Engine
- Registry
- Adapter for provider API
- Invocation logic for computeAnchors

### 10.4 Sequencer Engine
- Global store in localStorage
- Upsert/delete/filter

### 10.5 Legacy Compatibility Layer
- Window global surface
- Warning emissions

---

# 11. Backlog (v1.3+)

### 11.1 Integrate Runner & Blender Inside Chronus
Move existing runner.js and blender.js into Chronus core:
- Unified scheduling engine
- Unified time-window blending
- Shared cursor semantics
- Nexus-based update triggers

### 11.2 Cursor API Expansion
- Shared cursors across gadgets
- Lock/hold/release semantics
- Cursor observers

### 11.3 Provider Families
- Calendars
- Regional schedules
- Habit/event engines

### 11.4 Enhanced Atlas Cooperation
- Explicit GeoEnvelope diffing
- Multi-city parallel contexts
- Time travel debugging hooks

---

# END OF SPEC
