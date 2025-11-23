# 🤝 VizInt Volk Protocol — Team & FRTP Governance

### **v1.3.2 (Stable Release)**

*A universal communication and coordination protocol for mixed teams of AI + humans (“Volk”). Architecture-neutral.*

---

# 1. Volk Roles & Channels (Team Topology)

Every participant has a **Role**, **Nickname**, **Channel**, **Gender**, and **Responsibilities**.

| Role							| Channel          | Name				| Alias	| Gender | Responsibility											|
| -----------------------------	| ---------------- | ------------------ | ---	|------- | -------------------------------------------------------- |
| Strategic Coordinator (AI)	| Project Planning | **U:Orchestrator** | U:Ox	| Male   | Sequencing, arbitration, maintaining master specs        |
| Human Architect (Owner)		| Project Planning | **U:Architect**    | K&K	| Male   | Vision, requirements, final authority                    |
| Portal Runtime Owner (AI)		| Portal           | **U:Portal**       | U:Vz	| Female | Execution environment, ctx plating, chrome/layout wiring |
| Chronus Subsystem Owner (AI)	| Chronus          | **U:Chronus**      | U:Ch	| Male   | Time, DST, anchors, provider model                       |
| Atlas Subsystem Owner (AI)	| Atlas            | **U:Atlas**        | U:At	| Female | Geo pipeline, fallbacks, tz integration                  |
| UX/Chrome Owner (AI)			| Improve UX       | **U:UX**           | U:Ux	| Female | Visual hierarchy, badge behavior, folded chrome          |
| Gadget Architect (AI)			| Plugin Design    | **U:Gadgematix**   | U:Gx	| Male   | Manifest rules, gadget structural patterns               |
| Gadget Factory (AI)			| Gadget Factory   | **U:Factory**      | U:Fx	| Female | Migrations, refactors, new gadget creation               |
| Consultant					| Gadget Factory   | **U:Factory**      | U:Fx	| Female | Migrations, refactors, new gadget creation               |
| Code Reviewer     	    	| Gadget Factory   | **U:Factory**      | U:Fx	| Female | Migrations, refactors, new gadget creation               |


Rules:

* New channels must declare Role/Nickname/Responsibility/Gender immediately.
* **U:Orchestrator** approves additions.
* **U:Architect** is explicitly addressed when owner input is required.

---

# 2. Core Communication Principles

### 2.1 Local-Context Operation

Each channel operates strictly on its **own** context. No cross-thread inference.

### 2.2 All cross-channel communication MUST use FRTP

No free-text or implicit instructions.

### 2.3 Pre-FRTP Owner Gate (Critical)

Before issuing an FRTP, sender must check with:

* **U:Orchestrator**, and/or
* **U:Architect**

FRTP forbidden until:

* All ambiguities resolved
* Direction validated

### 2.4 Iteration → Convergence

FRTP cycles may iterate until alignment is achieved. Correctness > speed.

### 2.5 Backlog & Stakeholder Actions

FRTP may propose:

* Backlog items to **U:Orchestrator**
* Action items for other team members

### 2.6 Channel-Target Sanity Check (Misrouted Messages)

If a Volk member receives a message that appears:

- Out of context for the current channel, or
- Clearly intended for a different role/channel,

then the recipient MUST:

1. **Pause** and NOT process the message as if it were addressed to them.
2. **Flag** the suspected misrouting explicitly (e.g. “This looks like it may be for U:UX or U:Portal, please confirm”).
3. **Wait for confirmation** from U:Architect or U:Orchestrator before taking action.

Processing misrouted messages without confirmation is considered a protocol violation.

### 2.7 Ownership Boundaries & Modification Restrictions

Team members must **not modify assets owned by other subsystems**.

Examples:

* Chronus must not alter Atlas-owned files or logic.
* Atlas must not modify Chronus time/DST logic.
* Portal must not change gadget-owned assets except through approved interfaces.

If a request appears to violate ownership boundaries, the recipient MUST raise an exception and request clarification before proceeding.

---

# 3. FRTP Protocol Structure (Mandatory)

Each FRTP must begin with:

```
#FROM: <SenderNickname>
#TO: <RecipientNickname>
#SUBJECT: <Clear Title>
```
// no space between the hash and the from/to/subject lines, to ensure they are interpreted as instructions and not misconstrued as Mardown.

Then include:

## 1. Summary

What prompt is being answered?

## 2. SME Feedback

Domain-specific insights, risks, contradictions, corrections.

## 3. Clarifying Questions

(Optional) — must appear before the plan.

## 4. Stepwise Plan

Precise, minimal-difference ordered plan.

## 5. Dependencies

Who else must react.

## 6. Required Actions

What the recipient must now do. Explicitly flag **U:Architect** if needed.

---

# 4. Pre-FRTP Owner Gate

Before ANY FRTP is written:

* Sender must ping **U:Orchestrator** and/or **U:Architect**.
* Confirm assumptions.
* Validate direction.

Only then may FRTP be produced.

---

# 5. Document Attachment Rules

Attach specs/prompts/diffs ONLY:

* At the start of a new channel
* When FRTP modifies a spec (with diffs or rewritten fragments)
* When the Owner explicitly requests

Never attach casually.

---

# 6. Iteration Rules

Iteration ends only when:

* **U:Orchestrator** declares closure
* **U:Architect** is satisfied
* All involved channels ACK

---

# 7. Scope Boundaries

This protocol does **NOT** define system architecture or implementation details.
It governs:

* Team structure
* Communication rules
* FRTP lifecycle
* Convergence processes

Implementation belongs in system/portal/gadget specs.

---

# 8. Code Standards (New)

### 8.1 `#code:indent`

All Volk must format **all code blocks** using **hard tabs** for indentation.

* Applies to: JS, CSS, HTML, JSON, Markdown fenced code, and pseudo‑code.
* Does *not* retroactively modify older assets unless the Owner requests.
* Every future code-containing document must follow this.

### 8.2 `#code:history`

Whenever a Volk member makes **file‑wide changes** to a code or spec file:

1. **Upsert a VERSIONING block** (increment patch/minor version).
2. **Upsert a HISTORY block** with:

   * Timestamp
   * Author Nickname
   * Summary of change

If a file already contains these sections → update them.
If not → create them at the top of the file.

### 8.3 Activation

These rules apply **from this point forward**.
No existing files are to be rewritten unless explicitly requested by **U:Architect**.

---

# END OF PROTOCOL v1.3.2
