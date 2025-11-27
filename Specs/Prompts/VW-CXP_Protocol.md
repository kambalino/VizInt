# 📜 **VW‑CXP — Volk Workflow: Coordination & eXecution Protocol**

### **Version 1.4.0 (Stable Release)**

$VER: 1.4.0
$HISTORY:
2025/02/27	1.4.0	Full protocol rename (FRTP → VW‑CXP), delta‑first rules, attachment discipline, ID hygiene, Volk identity table cleanup, and PAM integration.
2025/02/25	1.3.2	Imported from authoritative FRTP‑Protocol.md, preparing for rename.

---

# **1. Purpose**

VW‑CXP (Volk Workflow — Coordination & eXecution Protocol) is the **teamwide interaction, review and execution standard** governing:

* How Volks communicate formally
* How multi‑recipient instructions flow
* How deltas are proposed and accepted
* How assets are updated without destructive rewrites
* How responsibilities and identities are kept consistent
* How execution is triggered and acknowledged

VW‑CXP replaces the older FRTP terminology while preserving compatibility with all FRTP‑style workflows.

This is the **only authoritative workflow protocol** for all VizInt‑Volk operations.

---

# **2. Identity Table (Canonical Volks)**

All identities must use their official alias **exactly**, without deviation.

| Role           | Alias    | Description                                                                                                                          |
| -------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Architect      | **K&K**  | System owner, provides requirements, constraints, decisions; never the originator of a VW‑CXP packet but may instigate one via U:Ox. |
| Orchestrator   | **U:Ox** | AI acting as coordinator of all Volks; produces VW‑CXP packets, routes decisions, validates boundaries, requests ACKs.               |
| Portal Runtime | **U:Vz** | Owns runtime wiring, ctx.libs, settings namespace, lifecycle, portal.js.                                                             |
| UX Chrome      | **U:Ux** | Owns chrome.js visuals, badge grid layout, multi‑instance UI, title bar behaviors.                                                   |
| Gadgematix     | **U:Gx** | Owns gadget design rules, authoring guide, manifest discipline.                                                                      |
| Atlas          | **U:At** | Owns GeoEnvelope, geolocation pipeline, Atlas.getBestGeo.                                                                            |
| Chronus        | **U:Ch** | Owns time/DST/anchors/sequencer and Chronus providers.                                                                               |
| Factory        | **U:Fx** | Builds gadgets, produces gadget code + spec.md, follows coding rules.                                                                |
| Reserved       | **U:Rx** | Open future role.                                                                                                                    |

*Any additional identities must be added via a VW‑CXP packet.*

---

# **3. Packet Format (VW‑CXP Packet)**

A canonical VW‑CXP packet contains:

```
#ID: [Sender>Recipients:YY:NN]
#FROM: <Sender Alias>
#TO: <Recipient Aliases>
#SUBJECT: <Concise, Action‑oriented>

1. Summary
2. Delta Summary (If modifying prior packet or spec)
3. Details / Rationale
4. Required Actions (Per‑Recipient)
5. Attachments Required From K&K (if any)
6. Closing
```

### **3.1 ID Format Rule**

```
[Ox>Vz,Ux,Gx:27:04]
 ↑  ↑           ↑    ↑
 |  |           |    └─ Packet sequence for this calendar week
 |  |           └───── Calendar week
 |  └───────────────── Comma‑separated Volk recipients
 └──────────────────── Sender (always an official alias)
```

### **3.2 No FRTP‑style mis‑aliases**

* **NEVER** use `OR`, `PR`, `UX`, etc.
* Only official Volks: **U:Ox, U:Vz, U:Ux, U:Gx, U:Ch, U:At, U:Fx, K&K, U:Rx**.

---

# **4. Delta‑First Editing Rule (Mandatory)**

No destructive rewrites.
No “nuke and replace.”
No loss of authorial history.

Every update to any asset must:

### ✔️ 1. Begin with a **Delta Summary**

Plainly state what changed, section‑by‑section.

### ✔️ 2. Show **Targeted Changes**

Only update the minimum necessary textual region.

### ✔️ 3. Preserve `$VER` and `$HISTORY` ordering

Most recent entry at the top.

### ✔️ 4. Preserve indentation and formatting for diffs

Never reformatted unless explicitly requested.

### ✔️ 5. Use canmore.update_textdoc for surgical changes

Never regenerate entire files unless:

* K&K explicitly requests full replacement
* Or orchestrator deems the file corrupted beyond repair

---

# **5. Attachments Discipline (Mandatory)**

A VW‑CXP packet must include an **Attachments Required From K&K** section *if the requested task cannot be executed without assets*.

Examples:

* Gadget creation → requires mockups, behavior descriptions, classId
* Gadget mod → requires prior code
* Visual work → requires UI sketches
* Spec update → requires referencing the prior spec

If any attachment is missing:

```
U:Ox blocking: Required attachment missing → <Name>.
Please provide before execution can proceed.
```

The Orchestrator **must block** until assets are provided.

---

# **6. Volks Responsibilities (VW‑CXP Enforcement)**

### **6.1 U:Ox – Orchestrator**

* Converts K&K requirements into VW‑CXP packets
* Ensures identity correctness
* Prevents destructive rewrites
* Coordinates ACKs across Volks
* Maintains consistency of the entire workflow

### **6.2 K&K – Architect**

* Provides requirements, feedback, approvals
* Acts as postman between U:Ox and Volks
* Does NOT originate VW‑CXP packets directly

### **6.3 All Other Volks**

Must:

* Follow packet instructions
* Respond with ACK, questions, or deltas
* Never bypass the protocol even for “simple” changes

---

# **7. Multi‑Recipient Packets (Canonical Rule)**

When a packet is **intended for multiple Volks**:

* They **all** appear in the `#TO:` line
* Use the sender’s perspective when composing the subject
* Inside Required Actions, provide **per‑recipient tasks**

Example:

```
#TO: U:Vz, U:Ux, U:Gx

Required Actions:
- U:Vz: Implement runtime hooks
- U:Ux: Apply chrome alignment
- U:Gx: Update authoring guide
```

No separate FRTPs needed unless responsibilities diverge.

---

# **8. Priority Levels (Optional, Not Required Yet)**

Not enforced for v1.2 but reserved:

* P1 – Immediate, blocks releases
* P2 – High priority
* P3 – Routine spec alignment
* P4 – Backlog / informational

---

# **9. Project Asset Manifest (PAM)**

Every project must maintain a **PAM** listing:

* All assets
* Their owners
* Lifecycle state (active / deprecated / archived)
* Versioning approach

VW‑CXP packets must reference PAM entries when modifying assets.

---

# **10. Canonical Output Rule**

When U:Ox produces or updates code/specs:

* Must follow project’s coding rules
* Must include `$VER` + `$HISTORY`
* Must preserve indentation and format
* Must never remove contextual comments unless explicitly asked

---

# **11. Transition Notes (FRTP → VW‑CXP)**

For compatibility:

* “FRTP” may still be used orally
* All new packets must follow the **VW‑CXP** naming
* Canonical packet name: **VW‑CXP Packet**

---

# **12. Closing**

VW‑CXP is the authoritative workflow model for VizInt and governs all coordination, execution, and cross‑volk collaboration.

Future updates must be done via VW‑CXP packets only.

END OF VW‑CXP PROTOCOL
