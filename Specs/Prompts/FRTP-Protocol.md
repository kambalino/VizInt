# 🤝 VizInt Volk Protocol — Team & FRTP Governance

### **v1.3.5 (Stable Release)**

*A universal communication and coordination protocol for mixed teams of AI + humans (“Volk”). Architecture-neutral.*

---

# 1. Volk Roles & Channels (Team Topology)

Every participant has a **Role**, **Nickname**, **Channel**, **Gender**, and **Responsibilities**.

| Role							| Channel					| Name				 | Alias| Gender | Responsibility											|
| -----------------------------	| -------------------------	| ------------------ | ---	|------- | -------------------------------------------------------- |
| Strategic Coordinator (AI)	| AI Orchestration			| **U:Orchestrator** | U:Ox	| Male   | Sequencing, arbitration, maintaining master specs        |
| Human Architect (Owner)		| Project Planning			| **U:Architect**    | K&K	| Male   | Vision, requirements, final authority                    |
| Portal Runtime Owner (AI)		| Portal					| **U:Portal**       | U:Vz	| Female | Execution environment, ctx plating, chrome/layout wiring |
| Chronus Subsystem Owner (AI)	| Chronus					| **U:Chronus**      | U:Ch	| Male   | Time, DST, anchors, provider model                       |
| Atlas Subsystem Owner (AI)	| Atlas						| **U:Atlas**        | U:At	| Female | Geo pipeline, fallbacks, tz integration                  |
| UX/Chrome Owner (AI)			| Improve UX				| **U:UX**           | U:Ux	| Female | Visual hierarchy, badge behavior, folded chrome          |
| Gadget Architect (AI)			| Plugin Design				| **U:Gadgematix**   | U:Gx	| Male   | Manifest rules, gadget structural patterns               |
| Gadget Factory (AI)			| Gadget Factory			| **U:Factory**      | U:Fx	| Female | Migrations, refactors, new gadget creation               |
| Project Consultant			| VizInt Project Consultant	| **U:Consultant**   | U:Cx	| Female | Team Consultant, 3rd part counsel and opinions           |
| [TBD] Code Reviewer     	   	| [TBD]	Reviewer			| **U:Reviewer**     | U:Rx	| Female | Applies meticulous code & doc review exercises           |
| Protocol Steward & Doc Lead	| Protocol Mgmt				| **U:PM**			 | U:PM	| Female | Owns FRTP Protocol, maintains authoritative file, enforces compliance |


Rules:

* New channels must declare Role/Nickname/Responsibility/Gender immediately.
* **U:Orchestrator** approves additions.
* **U:Architect** is explicitly addressed when owner input is required.
* FRTPs need to be as concise AND complete as possible
---

# 2. Core Communication Principles

### 2.0 Team Editing Doctrine (NEW)

 - To function effectively as a coordinated Volk team, all edits to shared documents must follow these principles:
 - Surgical updates only — Apply minimal additive changes to the exact section requiring modification.
 - Rewrite only when context has changed — Destructive edits are permitted only when earlier content is no longer valid.
 - Preserve prior team members' work — Never discard or overwrite entire sections when refinement is possible.
 - Enable diff-based collaboration — Edits must be structured so team members can compare changes with tools.
 - NEVER nuke existing assets and re-craft from scratch — This is a hard rule. Incremental evolution preserves clarity, history, and trust.

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
#ID: <formattedID>
#FROM: <SenderNickname>
#TO: <RecipientNickname>
#SUBJECT: <Clear Title>
```
No space between the hash and the from/to/subject lines, to ensure they are interpreted as instructions and not misconstrued as Markdown. `#FROM:` / `#TO:` / `#SUBJECT:` are tokens, not Markdown headers.
A space would promote them to headers and break FRTP parsing, and mar readability.

## 3.1 Message IDs

CONTEXT:
> 🚫 Identity Boundary Rule
> * A Volk may only issue FRTP messages FROM its own identity (#FROM: U:At, #FROM: U:Ch, etc.).
> * Drafts intended for another Volk must be addressed TO that Volk, never FROM them.
> * Impersonation (issuing an FRTP as another subsystem) is strictly forbidden and considered a protocol violation.

📡 FRTP Message ID Naming Convention (Mandatory v1.3.x)

Every FRTP must begin with an ID header on line 1 using the following pattern:

#ID: [ss>rr:dd:qq]


Where:

1. ss — Sender Code (2 letters)

The alias code of the sender — not the full names.

2. rr — Recipient Code (2 letters)

Same table as above.

3. dd — Day of Month (two digits)

01–31
Example: 03, 14, 22

4. qq — Sequence Number (per-sender, per-day)

00–99, starting at 00 each new day per sender.

Each sender maintains their own counter.

Examples:

First FRTP you send today → 00

Second FRTP you send today → 01

Fifth → 04

Examples (Valid)
#ID: [AT>CH:22:01]
#ID: [OR>PR:14:00]
#ID: [PM>KK:03:02]
#ID: [PR>FX:09:07]

Rules (Non-Negotiable)

 - This header MUST be the FIRST line of the FRTP.
 - No spaces inside the brackets except after the colon in the SUBJECT line later.
 - Each sender maintains their own qq counter.
 - Reset qq to 00 at the start of each day.
 - Codes MUST match the alias table.
 - This ID applies to every single FRTP, new or reply.

Then include:

## 3.1.1. Summary

A one-line reference to the prompt being answered (using its message ID).
FRTPs MUST NOT quote the full body of the message they are responding to.

## 3.1.2. SME Feedback

Domain-specific insights, risks, contradictions, corrections.

## 3.1.3. Clarifying Questions

(Optional) — must appear before the plan.

## 3.1.4. Stepwise Plan

Precise, minimal-difference ordered plan.

## 3.1.5. Dependencies

Who else must react.

## 3.1.6. Required Actions

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

# 8. Code & Spec Standards

### 8.1 `#code:indent`

All Volk must format **all code blocks** using **hard tabs** for indentation.

* Applies to: JS, CSS, HTML, JSON, Markdown fenced code, and pseudo‑code.
* Does *not* retroactively modify older assets unless the Owner requests.
* Every future code-containing document must follow this.

### 8.2 `#code:history`

Whenever a Volk member makes **file‑wide changes** to a code or spec file:

1. **Upsert a VERSIONING block** (increment patch/minor version).
2. **Upsert a HISTORY block** with:

   * Timestamp [Sorted by most recent first]
   * Version
   * Author Nickname
   * Summary of change

Formatted within an appropriate multi-line comment syntax, that includes markdown escapes around the history block to additionally facilitate viewing in markdown/canvasses - such as the following block:


/*
```text
2025/11/20	1.2.5	K&K & Co.	Clarified readiness semantics: Chronus.ready encapsulates all built-in
								provider readiness; no per-provider readiness surface in v1.2. Minor
								copy edits and structure tightening.
2025/11/19	1.2.4	Djho		Merged old+new specs; added anchor taxonomy, pub/sub, DST clarifications,
								provider contract, caching rules, backlog for runner/blender.
2025/11/18	1.2.3	Lillypunter	Added Atlas pull-model contract.
2025/11/18	1.2.2	U:Vz		Added GeoEnvelope semantics + optional geo overrides.
2025/11/18	1.2.1	U:Ox		Initial Chronus v1.2 spec draft (public API, providers, contexts, DST).
```
*/

If a file already contains these sections → update them.
If not → create them at the top of the file.

### 8.3 Activation

These rules apply **from this point forward**.
No existing files are to be rewritten unless explicitly requested by **U:Architect**.


### 8.4 Prologue Requirements for SPEC Files

All SPEC documents maintained by any Volk **must** include a prologue at the top of the file:

```text
$VER: <semantic-version>
$HISTORY:
	YYYY/MM/DD	<version>	<description>
```

Tabs are mandatory: one tab before the date, one before the version, one before the description.

This FRTP Protocol file is itself the canonical example; its prologue at the top of this document is the live reference instance.

FRTP messages themselves are **exempt** from prologue requirements.

### 8.5 Prologue Upserts

All future SPEC revisions must:

* Update `$VER` to the new semantic version.
* Append a tab-aligned `$HISTORY` entry describing the change.

### 8.6 Spec files Sharing
Spec files MUST be shared in canvasses to preserve Markdown fidelity.
Plain-text reprints are no longer allowed unless major obstacles present themselves, and in that case should be negotiated with the K&K

---

###### END OF FRTP PROTOCOL
