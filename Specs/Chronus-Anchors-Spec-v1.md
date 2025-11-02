
# 🧭 Chronus Anchors — Core Specification (v1)
**Project Milestone #CH-001**  
_Anchors, not Events; Runner separated; Cursor + Context design finalized_

---

## 1️⃣ Overview
### Intro
Chronus is the time-engine that keeps every part of a digital dashboard “in sync with the world” — whether that means showing, the end of the workday, tomorrow’s sunrise, the New Year, or custom routines like “exercise + shower + laundry” all woven together.

### Purpose

Chronus Anchors provides a unified temporal intelligence layer for VizInt and other modular gadgets.
It centralizes time, frames, and location awareness so all gadgets share one heartbeat of “when” and “where.”

#### What We’re Trying to Accomplish

We want an extensible, calendar-aware system that can:

* Understand time, not just measure it.
 Recognize daily, weekly, monthly, and annual cycles — religious, civic, astronomical, or personal.
* Blend immutable and dynamic events.
Show fixed Anchors (like sunrise or tax deadlines) alongside live user sequences (like Morning Routine).
* Travel through time and place.
Ask “What time is Fajr tomorrow in Zamboanga?” or “How much time until next EOM in Cairo?”
* Provide a single hub other gadgets can subscribe to, instead of duplicating time math.
Chronus does for time what a graphics engine does for visuals — it keeps multiple moving parts coordinated.

#### Examples
🟢 Example A — Simple (no blending)

Goal: “Days left in the month.”

Anchors: End-of-Month (EOM) at 23:59 on the last day.

Blend output: A single countdown to the EOM Anchor.
Result: The gadget displays “12 days 06:15:42 remaining.”

🟣 Example B — Sophisticated (with blending)

Goal: Plan an evening that includes Laundry + Exercise + Shower, while respecting prayer times.

Anchors: Maghrib 19:10, Isha 20:45, End of Day 22:30.

Recipes:

Laundry (collect → wash → dry)

Exercise (stretch → run 20 min → rest)

Shower (prep → shampoo → dry off)

Runs: User starts these recipes; each step becomes part of the live schedule.

Blend: Chronus merges Anchors + active Runs, prevents resource conflicts (washer/bathroom), and emits unified tick events.
Result: The user sees a timeline where Fajr and EOD coexist with dynamic task progress bars — one continuous rhythm of the evening.

### Scope
Chronus Anchors manages:
- **Time logic:** cursor, frames, and ticking.
- **Geolocation:** multiple contexts with time zones and coordinates.
- **Immutable Anchors:** unified schedule for prayer times, civic events, astronomy, etc.

Chronus Anchors does **not** manage:
- Stateful sequences (Recipes, Steps, Runs).  
- UI layout or rendering logic.

### Design Principles
- Lightweight and composable
- Provider-driven
- Pub/Sub-based integration
- DST-safe and multi-geo-aware
- Calendar-agnostic (supports multiple calendar systems)

---

## 2️⃣ Core Concepts

| Concept | Description |
|----------|-------------|
| **Anchor** | Immutable moment in time (e.g., Fajr, DST start, noon). |
| **Frame** | Time scope filter (Daily, Weekly, Monthly, Annual). |
| **Context** | Geo/timezone environment (lat/lng/tz/method). |
| **Cursor** | The “when” — allows time-travel (past/future views). |
| **Recipe** | User-defined template of sequential actions. |
| **Run** | Internal, transient execution of a Recipe (hidden from UX). |
| **Blend** | The merged temporal view combining Anchors and active Runs for a given frame, context, and cursor. |

---

## 3️⃣ Architecture & Layering

1. **Chronus Anchors (Core Hub):**  
   Manages frames, contexts, cursor, tick loop. Collects anchors from providers. Publishes updates via pub/sub.

2. **Providers (Anchor Sources):**  
   Independent modules that produce anchors (PrayerTimes, Civic, Calendar, Astronomy).

3. **Runner/Sequencer (Optional):**  
   Manages stateful recipes and steps; consumes anchors read-only.

4. **Gadgets (Subscribers):**  
   Render anchor-based data (EOM, Daily, Prayer Viewer) or manage recipes (Todo Mixer).

---

## 4️⃣ Data Model

```json
Anchor {
  id: "fajr",
  label: "Fajr",
  at: "2025-11-02T05:12:00-07:00",
  frame: "daily",
  category: "religious",
  contextId: "current-geo",
  source: "PrayerTimesProvider"
}

Context {
  id: "timbuktu",
  label: "Timbuktu, ML",
  tz: "Africa/Bamako",
  lat: 16.7666,
  lng: -3.0026,
  method: "MWL"
}

Frame ∈ ["daily","weekly","monthly","annual"]
Cursor: Date (the focal point of analysis)
```

---

## 5️⃣ API Surface

### A. Context Management
```js
addContext(ctx)
setActiveContext(id)
listContexts()
```

### B. Frame & Cursor Controls
```js
setFrame('daily'|'weekly'|'monthly'|'annual')
setCursor(date)
jump({days, weeks, months, years})
```

### C. Anchor Management
```js
upsertAnchors(contextId, frame, anchors[])
getAnchors({contextId?, frame?, range?})
```

### D. Lifecycle
```js
start()   // begin tick loop
stop()    // stop loop
```

### E. Pub/Sub
```js
on('anchor:tick', fn)
on('blend:update', fn)
on('cursor:change', fn)
on('context:change', fn)
on('provider:error', fn)
```

---

## 6️⃣ Provider Interface

### Contract
```js
async provide({ context, frame, cursor }) → Anchor[]
```

### Examples
- **PrayerTimesProvider** – daily prayer anchors (supports multiple methods).  
- **CivicProvider** – annual tax/voting anchors.  
- **CalendarProvider** – ICS/Google events.  
- **AstronomyProvider** – solstice, equinox, moon phases, eclipses.  
- **LunarProvider (future)** – Hijri, Chinese, Hebrew calendar events.

---

## 7️⃣ Event Vocabulary

| Event | Payload | Description |
|--------|----------|-------------|
| `chronus.anchor.tick` | `{contextId, id, label, at, etaSecs, isPast}` | Per-second updates |
| `chronus.blend.update` | `{contextId, frame, anchors[]}` | When anchors refresh |
| `chronus.cursor.change` | `{cursor, frame}` | Time-travel or frame change |
| `chronus.context.change` | `{activeContextId}` | Context switch |
| `chronus.provider.error` | `{provider, message}` | Provider issues |

*(Future runner events: `runner.run.tick`, `runner.plan.update`.)*

---

## 8️⃣ Time-Travel & Multi-Geo Design

- **Cursor:** shifts date/time; recalculates anchors at that moment.  
- **Context:** defines geo + tz; each maintains its own anchor list.  
- **Multiple contexts:** allow side-by-side or overlay comparisons.  
- **Calendars:** Chronus supports Gregorian, Hijri, Chinese, and others through specialized providers.  
  Example: `HijriProvider.provide({cursor})` returns equivalent lunar anchors.

---

## 9️⃣ Gadget Integration Examples

| Gadget | Description |
|---------|-------------|
| **Prayer Times Viewer** | Multi-geo + time-travel; cursor-aware outputs. |
| **EOM Gadget** | Monthly anchors and countdowns. |
| **Daily Milestones** | Daily blend (prayers + EOD). |
| **Todo Palette Mixer** | Subscribes to anchors for guardrails; uses Runner for Steps. |

---

## 🔟 Runner/Sequencer (Future Module)

- Namespace: `Runner`  
- Uses `Chronus.on('anchor:tick')` as optional input.  
- Manages internal Runs and Steps; exposes state to UI gadgets.

---

## 1️⃣1️⃣ Extensibility & Future Providers

Planned additions:
- **CivicProvider:** Tax season + voting deadlines.  
- **MoonProvider:** Lunar phases and eclipse events.  
- **DSTProvider:** daylight shift markers.  
- **Lunar/Multicalendar Providers:** Hijri, Chinese, Hebrew calendars.  
- **ICS/CalendarProvider:** integrate family or personal calendars.

---

## 1️⃣2️⃣ Implementation Notes

- Keep core ≤ 150 lines.  
- Use simple pub/sub (window.dispatchEvent or listener maps).  
- Handle DST and tz conversions via context tz.  
- Avoid UI dependencies.  
- Support offline (`file://`) fallback gracefully.  
- Providers determine their own precision and refresh intervals.

---

## 1️⃣3️⃣ Milestone Tag

> Chronus Anchors Spec v1 — **Project Milestone #CH-001**  
> (“Anchors, not Events; Runner separated; Cursor + Context design finalized”)
