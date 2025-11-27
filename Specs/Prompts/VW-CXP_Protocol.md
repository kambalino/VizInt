# VW-CXP v1.4.1 — Volk Workflow: Coordination & eXecution Protocol

## $VER: VW-CXP 1.4.1

## $HISTORY:

```
2025/03/27	1.4.1	Protocol refinements: ID semantics, identity boundary rule, misrouting guardrails, PAM ownership, FRTP→CXP rename, sample PAM, removal of unused priorities.
2025/03/26	1.4.0	Initial migration of FRTP Protocol → VW-CXP.
```

---

# 1. Purpose

VW-CXP defines **how Volks communicate, coordinate, review, and execute work** across the VizInt ecosystem.
It replaces the old *FRTP* protocol with a cleaner, name-safe, evolution-friendly workflow.

All packets using this protocol are now called **CXP Packets**.

---

# 2. CXP Packet Format

Each packet MUST contain the following headers:

```
#ID: [Sender>Recipients:WW:NN]
#FROM: <Alias>
#TO: <Alias(es)>
#SUBJECT: <Brief description>
```

### ID Semantics (Clarified)

* **WW** = ISO calendar week number (01–53)
* **NN** = sequence index issued by the **Sender** for that week (00–99)
* The counter resets weekly **per sender**

Example:
`[Ox>Vz,Ux,Gx:27:04]` means:

* Sent by **U:Ox**
* Delivered to **U:Vz, U:Ux, U:Gx**
* Sent in week **27**
* It is Ox’s **4th** packet of that week

---

# 3. Identity Boundary Rule (Reintroduced & Corrected)

**No Volk may issue CXP packets using another Volk’s alias.**

### Rules:

1. **A Volk speaks only in its own alias.**
2. Drafts intended *for* another Volk must use that Volk only in the **#TO** field.
3. **Impersonation is a protocol violation.**
4. **K&K Clarification:**

   * K&K MAY originate CXP packets when acting in a system-owner/editorial capacity.
   * But K&K never uses a Volk alias (Ox, Vz, Ux, etc.).
   * When K&K requests a packet, U:Ox authors it.

---

# 4. Asset Ownership Guardrails (Reinstated)

Volks must respect explicit ownership of files, assets, and code.

### 4.1 Do not modify another Volk’s assets unless:

* You are using an approved public interface, **OR**
* You have received explicit CXP authorization from U:Ox or K&K.

### 4.2 Misrouting Protection (Reinstated)

If a packet or directive appears misrouted:

1. **Pause.**
2. **Flag the suspected misrouting** in a reply to U:Ox.
3. **Await confirmation** before acting.

This prevents runtime and UX cross-edit contamination.

---

# 5. Editing Workflow (Tool-Agnostic Revision)

When modifying existing artifacts:

* Always perform **surgical edits, not wholesale rewrites**, unless explicitly authorized.
* Use the project’s **surgical-edit mechanism** (e.g., `canmore.update_textdoc`) to maintain diff clarity.

Wholesale regeneration is permitted only when:

* A major version bump is requested, or
* K&K explicitly approves it in a CXP Packet.

---

# 6. Canonical Output Rules

Each CXP response must:

* Use delta-first editing
* Include version bumps for any updated asset
* Maintain chronological `$HISTORY` with newest-first ordering

When a packet results in changes to project files, the sender MUST:

1. Update the file
2. Append a `$HISTORY` line
3. Notify affected Volks

---

# 7. Project Asset Manifest (PAM) — Formalized

The VizInt **Project Asset Manifest (PAM.md)** is now an official part of VW-CXP.

### 7.1 PAM Ownership

* **Authored by:** U:Ox
* **Approved by:** K&K
* **Maintained by:** Relevant Volks through CXP Packets

### 7.2 Required Sections in PAM.md

Each entry must specify:

* Asset Name
* Owner (Volk)
* Versioning scheme
* Lifecycle State (active, deprecated, pending migration)
* Relationship to other assets

### 7.3 Sample Entries (Required in PAM appendix)

```
portal.js
	Owner: U:Vz
	State: Active
	Notes: Runtime wiring and ctx.libs authority

chrome.js
	Owner: U:Ux
	State: Active
	Notes: Exclusive owner of gadget chrome construction

VizInt-Chronus-1.2.md
	Owner: U:Ch
	State: Active
	Notes: Definition of Chronus v1.2 API & boundaries
```

---

# 8. Removal of Priority Levels

The unused P1–P4 priority section has been **removed entirely** in v1.4.1.

It may be reintroduced in a future version *only* with a full operational model.

---

# 9. Multi-Recipient Packets

CXP supports multi-recipient routing via:

```
#TO: U:Vz, U:Ux, U:Gx
```

Each recipient MUST:

* ACK if required
* Or explicitly decline responsibility

This replaces the old “Required Summary Table” mechanism.

---

# 10. FRTP → CXP Terminology Migration

The protocol formerly known as **FRTP** has been fully renamed:

* **FRTP** → **CXP Packet**
* **FRTP Response** → **CXP Response**
* **FRTP Delta** → **CXP Delta**

All teams must adopt this terminology effective immediately.

---

# 11. Closing

VW-CXP v1.4.1 strengthens clarity, removes ambiguity, restores essential safety rules, and aligns all Volks under a modern, reliable coordination protocol.

Further enhancements will follow once PAM.md is expanded and connected formally to the Specs.

END OF VW-CXP v1.4.1
