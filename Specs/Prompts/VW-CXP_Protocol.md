# 📜 **VW-CXP — Volk Workflow: Coordination & eXecution Protocol**

```
$VER: 1.4.5
$HISTORY:
2025/11/27	1.4.5	Formatting and meta-data refinements
2025/11/27	1.4.4	Glossary + Minor Refinements
2025/11/26	1.4.3	Restored role commentary & original schematic blocks, improved Purpose section, reinstated attachment rules, clarified FRTP paragraph (removable), added header-token constraints, refined multi-recipient rules.
2025/11/26	1.4.2	Protocol refinements: identity boundary rule, PAM ownership, CXP rename, sequence semantics.
2025/11/25	1.4.0	Initial FRTP → CXP migration draft.
```

---

# **0. Prologue**

VW-CXP is the **workflow operating system** for the VizInt project.
It defines communication, routing, execution, responsibilities, and disciplined evolution of shared assets between the participants and applies equally to participants including AI folks and human folks, referred to collectively as "Volks".

> 📝 **Note:** The FRTP paragraph below is *removable* for future projects to avoid legacy confusion.

FRTP has been fully retired and renamed. All new formal communications must use **CXP Packets**.

---

# **1. Purpose**

VW-CXP governs **how** VizInt Volks work together:

* How communication flows
* How packets are formatted and routed
* How identity is enforced
* How edits evolve non-destructively
* How responsibilities are partitioned
* How assets change safely
* How ACK cycles and execution are triggered

VW-CXP is **not** an architecture spec.
It defines *process*, *discipline*, and *coordination* — the backbone of the VizInt development culture.

---

# **2. Official Volk Identity Table**

| Role				| Full Name		| Alias	| Channel				|
| ----------------- | ------------- | ----- | --------------------- |
| Orchestrator      | Orchestrator	| U:Ox  | Project Orchestration	|
| Architect / Owner | K&K			| K&K  	| Project Planning		|
| Portal Runtime    | Portal		| U:Vz  | Portal Runtime		|
| UX / Chrome       | UX Lead		| U:Ux  | UX					|
| Gadgets Architect | Gadgematix	| U:Gx  | Plugin Design			|
| Gadget Factory    | Factory		| U:Fx  | Gadget Factory		|
| Chronus Subsystem	| Chronus		| U:Ch  | Chronus				|
| Atlas Subsystem	| Atlas			| U:At  | Atlas					|
| Code Reviewer		| TBD			| U:Rx  | TBD					|

### **Role Responsibilities (Guidance)**

*(These are advisory, not binding. Roles may evolve.)*

* **U:Ox** — Maintains workflow integrity, routes decisions, validates packets.
* **K&K** — System owner; provides requirements; may issue CXP Packets directly.
* **U:Vz** — Owns runtime wiring, ctx.libs, instantiation, settings persistence.
* **U:Ux** — Owns chrome.js visuals, badge grid, multi-instance UI logic.
* **U:Gx** — Owns gadget design system, manifest rules, authoring guidelines.
* **U:Fx** — Produces gadgets, spec.md, and migration work.
* **U:Ch** — Owns Chronus providers, anchors, cursors, DST logic.
* **U:At** — Owns Atlas pipeline and GeoEnvelope semantics.

Aliases should rarely change.
Any new identity must be introduced via a CXP Packet.

---

# **3. CXP Packet Header Format (Mandatory)**

```
#ID: [Sender>Recipients:WW:NN]
#FROM: <Alias>
#TO: <Alias(es)>
#SUBJECT: <Short Title>
```

### **3.1 Header-token rules**

* `#ID:`, `#FROM:`, `#TO:`, `#SUBJECT:` **must start at column 1**
* No preceding spaces (because preceding spaces will convert #directives in to markup syntax)
* No trailing spaces
* These must remain literal tokens for tooling consistency

---

# **4. ID Semantic Schematic (Restored)**

```
[Ox>Vz,Ux,Gx:27:04]
 ↑  ↑        ↑  ↑
 |  |        |  └────── Sequence number (per sender, resets weekly)
 |  |        └───────── Calendar week (01–53)
 |  └────────────────── Recipient list (comma-separated)
 └───────────────────── Sender
```

Rules:

* NN increments by sender
* One sender only
* Recipients separated by commas
* Highest-impact recipient first

---

# **5. Identity Boundary Rule (Mandatory)**

1. A Volk may speak **only** in its own alias.
2. Drafts intended for another Volk must list that Volk in `#TO`.
3. K&K may elect to use freeform messages, or CXP Packets (no restriction).
4. Impersonating another alias is a protocol violation.

---

# **6. Misrouted Packet Rule (STOP-AND-FLAG)**

If a packet appears intended for a different role:

1. **STOP** (do not execute it).
2. **FLAG** misrouting in a reply to U:Ox + K&K.
3. **WAIT** for confirmation.

Prevents accidental subsystem damage.

---

# **7. Ownership Boundaries**

Volks may not modify assets outside their domain unless:

* A stable public interface permits it
* A CXP Packet explicitly grants modification rights
* K&K authorizes temporary modification

Examples:

* Portal cannot modify Atlas pipeline
* Atlas cannot alter Chronus provider logic
* UX must not change runtime instantiation or ctx.libs wiring

Ownership protects architectural clarity.

---

# **8. CXP Packet Structure (Canonical)**

Packets must follow this order:

1. **Summary**
2. **SME Feedback**
3. **Clarifying Questions**
4. **Plan (Delta-first, minimal changes)**
5. **Dependencies**
6. **Required Actions (per recipient)**

Readable. Deterministic. Diff-friendly.

---

# **9. Team Editing Doctrine (Non-Destructive)**

### Core Principles

* Delta-first editing
* Preserve `$VER` and `$HISTORY`
* Maintain indentation (hard tabs)
* Use surgical tools (e.g., canmore.update_textdoc)
* Never hallucinate missing content
* No deleting files without explicit K&K approval

### Behavior Guidance

* < 10 lines → surgical update
* > 10 lines → structured diff proposal
* Only rewrite entire files when authorized

---

# **10. Attachment Discipline (Clarified)**

Attachments must be included **only when required for execution**.

Examples that *require* attachments:

* Gadget spec updates
* Gadget creation
* UX behavior changes
* API contracts
* Any change requiring reference to prior code

If required attachments are missing:

```
Blocking: Required attachment missing → <Name>.
Please provide before execution.
```

**Never attach casually.**
Avoid bulk attachments when a 5–7 line diff suffices.

---

# **11. Project Asset Manifest (Minimal, Per Owner Request)**

A **sortable**, compact PAM.md listing:

(Recommended: keep the PAM alphabetized by asset path for diff clarity.)


```
{asset path} | {description} | {owner}
```

Example:

```
Path to Asset				| Description								| Owner Alias
./path/portal.js			| runtime wiring, ctx.libs authority		| U:Vz
./path/chrome.js			| chrome visuals, badge grid logic			| U:Ux
./path/VizInt-Atlas.md		| GeoEnvelope + pipeline					| U:At
./path/VizInt-Chronus.md	| Anchors, DST, providers					| U:Ch
./path/registry.js			| gadget registry							| U:Vz
```

The PAM.md file is the authoritative index of system assets.  
All Volks must keep it aligned with reality.  
Any asset additions, removals, or ownership changes MUST be expressed via a CXP Packet.

---

# 12. Micro-Glossary (Optional)

**Volk**  
A subsystem persona (AI or human) with defined responsibilities, identity, and ownership boundaries.

**CXP Packet**  
The standard communication format for coordination, decisions, deltas, and routing under VW-CXP.

**Surgical Edit**  
A targeted, non-destructive modification (typically <10 lines) applied using the project’s editing mechanism (e.g., canmore.update_textdoc).

**Delta-First Editing**  
A protocol requirement prioritizing minimal changes, diff visibility, and preservation of `$VER` + `$HISTORY`.

**Descriptor**  
A structured object created by portal.js describing a gadget instance (classId, instanceId, capabilities, badges, etc.) consumed by chrome.js.

**PAM.md**  
Project Asset Manifest. The authoritative index of system assets and ownership, updated only via CXP Packets.


* This document is normative
* Authored by U:Ox and approved by K&K
* Maintained collaboratively by relevant Volks  
* All changes must follow the Team Editing Doctrine and must preserve $VER and $HISTORY.
* Updated strictly via CXP Packets

# END OF VW-CXP