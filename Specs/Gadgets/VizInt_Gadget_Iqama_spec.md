# Masjid Iqama Countdown Gadget — spec.md

$VER: 0.2.0
$STATUS: Draft (UI + semantics locked)
$OWNER: U:IqamaRSS (implementation)
$REVIEWERS: U:Factory (Factorinox)
$TYPE: Gadget (multi-instance)

---

## 0. Purpose

A multi-instance VizInt gadget that displays **Iqama (إقامة) times**, highlights the **next upcoming Iqama**, and shows a **countdown with urgency semantics**.

This gadget is **NOT** an Adhan tracker.
All time semantics, labels, accessibility text, and UI language MUST make the **Iqama vs Adhan** distinction explicit.

Each gadget instance represents **one Masjid feed**.

---

## 1. Core Display Goals

Each gadget viewport MUST:

* Display **all Adhan + Iqama times** for the day
* Render **Iqama times in bold**
* Highlight the **next upcoming Iqama**
* Display a **countdown to the next Iqama**
* Include a **progress bar showing remaining time**
* Remain readable, stable, and non-jittery as time updates
* Work across **multiple instances independently**

---

## 2. Manifest (Authoritative)

_api: "1.0"
_class: "masjid-iqama"
_type: "multi"
_id: "default"
_ver: "0.2.0"
label: "Masjid Iqama"
capabilities: ["settings", "network", "chronus"]

Registration (required):

window.GADGETS[manifest._class] = api

---

## 3. Settings Model (Per Instance)

settings = {
masjid: {
name: string        // REQUIRED; displayed prominently
},

feed: {
url: string         // REQUIRED; RSS endpoint
},

refreshSeconds: number,  // default: 60 (RSS fetch cadence)

display: {
showArabicLabel: boolean,   // default: true
largeTypography: boolean    // default: true
},

debug: {
showLastFetch: boolean      // default: true
}
}

Defaults MUST be applied defensively if settings are missing.

---

## 4. RSS Input Contract

### 4.1 Source

* RSS 2.0 feed
* Example: [https://masjidalwadood.com/api/rss.php](https://masjidalwadood.com/api/rss.php)

### 4.2 Parsing Rules (Strict)

* RSS timestamps are treated as **absolute times**
* **No fuzzy parsing**
* **No inference**
* **No heuristics**
* If required fields cannot be parsed deterministically → explicit error state

### 4.3 Extracted Data

For each prayer entry:

* Prayer name (Fajr, Dhuhr, Asr, Maghrib, Isha)
* Adhan time
* Iqama time

---

## 5. Time Semantics (LOCKED)

### 5.1 Countdown Target

* Countdown is **always to the next Iqama**
* Includes **Fajr of the next day** when past Isha

### 5.2 Update Cadence

* Countdown updates every **10 seconds**
* RSS fetch occurs only per refreshSeconds
* Countdown ticks MUST NOT trigger refetch

---

## 6. Progress Bar Semantics (EXECUTIVE DECISION — LOCKED)

### 6.1 Meaning

* Progress bar represents **time remaining**
* **100%** → just after previous Iqama
* **0%** → time has run out → you should be in the mosque by now

### 6.2 Calculation

remaining = nextIqama - now
totalInterval = nextIqama - previousIqama
percentageRemaining = clamp(remaining / totalInterval, 0..1)

---

## 7. Viewport Layout (Authoritative)

The entire UI MUST render as **one contiguous viewport**.

### 7.1 Header

* Left-aligned: Iqama
* Center: **Masjid name**
* Right-aligned:

  * Arabic label: إقامة
  * Manual refresh icon (⟳) immediately to its right

---

## 8. Prayer Table

* All prayers listed vertically
* Each row shows:

  * Prayer name
  * Adhan time
  * **Iqama time in bold**
* The **current interval** (previous → next Iqama) visually contains the progress bar

---

## 9. Countdown Progress Bar (CRITICAL)

### 9.1 Placement

* The progress bar MUST be rendered **between the two Iqama rows it applies to**

  * Example: between Asr and Maghrib

### 9.2 Labeling (LOCKED)

* Countdown label rendered **inside the progress bar**
* Format: ⏱️ HH:MM left
* Emoji MUST be **⏱️ (stopwatch)**

### 9.3 Floating Behavior

* Label floats **inside the bar**
* Positioned on the **side with more available space**
* MUST NOT cause layout jitter
* Use tabular numerals / fixed-width reservation

---

## 10. Footer (Preserved)

Footer MUST include:

* Grey footnote with:

  * X minutes remaining (minutes-only)
  * Last updated HH:MM:SS

Example:

157 minutes remaining • Last updated 12:42 PM

---

## 11. Error States

Must explicitly render:

* RSS unreachable (CORS / network)
* Invalid RSS
* Missing Iqama data

Errors MUST:

* Be user-readable
* Not crash the gadget
* Preserve chrome controls (settings, refresh)

---

## 12. Multi-Instance Guarantees

* Each instance:

  * Has independent settings
  * Fetches independently
  * Maintains independent countdown state
* No shared globals
* No shared DOM IDs

---

## 13. Non-Goals (Explicit)

* No Adhan countdown mode
* No fuzzy prayer inference
* No probabilistic corrections
* No auto-timezone guessing (uses browser local time)

---

## 14. Validation Checklist

* Two instances with different Masajid
* Correct rollover after Isha → Fajr
* Progress bar drains to 0%
* Countdown updates every 10 seconds
* Settings save closes dialog
* Reload preserves state
