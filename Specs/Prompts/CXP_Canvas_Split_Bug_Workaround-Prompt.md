#ID: [Gx>Ox,Vz,Ux,Fx:48:22]
#FROM: U:Gadgematix (U:Gx)
#TO: U:Orchestrator (U:Ox), U:Portal (U:Vz), U:UX (U:Ux), U:Factory (U:Fx)
#SUBJECT: CXP — Canonical Canvas Publishing Discipline for Specs & Long Markdown (v1.2.x)

1. Summary

This packet documents the **canonical workflow** for publishing long Markdown specs and code-like documents via ChatGPT’s Canvas view, in a way that avoids:

* Silent truncation or “splitting” of files
* Lost indentation or list structure
* Partial or out-of-order fragments

It is intended as **authoring guidance for Volks** who rely on ChatGPT to generate or update long `.md` specs (e.g., `VizInt-Gadgets-1.2.md`) and want a **single, copy/paste-safe artifact**.

The guidelines here reflect the emergent best practices discovered during recent VizInt spec work.

---

2. Core Principle — One Canvas, One Complete File

For any substantial spec or code document:

* **Exactly one Canvas textdoc per logical file.**

  * Example: `VizInt-Gadgets-1.2.md` should live in a single Canvas document.
* **Each update must contain the *entire* file content**, not just a patch.

  * ChatGPT may reason in deltas, but the *output* to the Canvas must always be the full, contiguous `.md` file.
* **No splitting across multiple canvases** for the same file unless explicitly versioned (e.g., `...-v1`, `...-v2`) and clearly retired.

Rationale: this guarantees that “Select All → Copy” from the Canvas is always a faithful, complete representation of the file.

---

3. Formatting Rules to Avoid Splitting Bugs

To minimize Canvas rendering issues and splitting:

3.1 Avoid nested triple-backtick fences for top-level docs

* Prefer treating the **entire document as Markdown**, not as a fenced code block.
* Only use code fences for **local excerpts** (e.g., a single JS snippet inside the `.md`).
* Do **not** wrap the entire spec in `...`; that is where splitting & escaping bugs tend to show up.

3.2 Keep document type consistent

* When creating the Canvas textdoc, use `type: "document"` (not `code/...`) for specs.
* This ensures the editor behaves as a Markdown document, not as a code-only buffer.

3.3 No interleaved commentary inside the canvas content

* The Canvas content should **only** contain the target file (e.g., the spec), not side-comments.
* Any discussion, rationale, or CXP chatter lives in the chat stream, not inside the spec body.

---

4. Update Discipline — Surgical in Semantics, Not in Output

4.1 Internal reasoning vs external output

* ChatGPT is free to reason in terms of *diffs* (e.g., “insert a subsection under §6” or “fix `_ver` comment grammar”).
* However, the Canvas update must **always overwrite the entire doc with the new, fully-integrated version**.

4.2 No “nukes” unless explicitly requested

* Specs must **not** be radically shortened or re-invented unless the Orchestrator explicitly orders a full rewrite.
* Length deltas must be explainable by actual content removal or consolidation that was requested.

4.3 Version & history lines

* Files that track versions (e.g. `$VER`, changelog sections) must be updated as part of the Canvas content.
* ChatGPT must ensure new entries:

  * Keep chronological order
  * Preserve existing history lines
  * Clearly summarize the actual changes

---

5. Gadget-Spec Example — How to Apply This in Practice

For files like `VizInt-Gadgets-1.2.md`:

5.1 Creating or replacing the spec

* ChatGPT must:

  * Create a single Canvas document named clearly (e.g. `VizInt-Gadgets-1.2.md` or `VizInt-Gadgets-1.2-spec`).
  * Populate it with the **entire** spec body, including:

    * Title, intro, and `$VER` block
    * All sections and subsections
    * All examples (HelloWorld, multi-instance patterns, etc.)

5.2 Applying a requested patch

When the Orchestrator or another Volk says, for example:

> “Add a note that clicking the settings gear again should close the settings panel if it’s already open.”

ChatGPT must:

1. Internally locate the appropriate section (e.g. settings behavior section).
2. Integrate the new paragraph(s) or bullets into the spec text.
3. Update the `$VER` / history line.
4. Write **the entire updated spec** back into the same Canvas document.

The user must never have to manually re-stitch fragments from chat messages.

---

6. ChatGPT-Side Instructions (for Volks Using This As a Prompt)

If another Volk (or another ChatGPT instance) is to follow this discipline, the *prompt phrasing* to them should be roughly:

> “When you update `X.md`, always maintain a single Canvas document for it. Don’t show me only diffs in the chat. Instead, regenerate the full updated file into the Canvas so I can Ctrl+A/Ctrl+C from there. Avoid wrapping the entire document in triple-backticks. Use local fences only where needed, and never split the file across multiple Canvas docs.”

Key enforcement points:

* **One file → one canvas.**
* **Updates = full document replacement, not fragments.**
* **No top-level ``` fences around the whole doc.**
* **Keep changelog in sync with real edits.**

---

7. Plan & Required Actions

For U:Gadgematix (U:Gx)

* Use this CXP as the canonical reference for how to ask ChatGPT to manage long specs via Canvas.
* When asking for edits:

  * Be explicit that you expect a **full updated file** in the spec’s Canvas.
  * Refer back to this CXP ID if needed.

For U:Portal (U:Vz) & U:UX (U:Ux)

* When requesting spec changes that affect Portal or chrome behavior, assume Gx will:

  * Capture the fully-updated `.md` in a single Canvas.
  * Provide a single copy/paste artifact for implementation teams.

For U:Factory (U:Fx)

* Treat the Canvas version of specs as the **source of truth** when generating gadgets, templates, or migrations.
* Avoid using partial fragments quoted in chat as the “real” spec.

---

8. Closing

This CXP establishes the **Canvas Publishing Discipline** for VizInt-era gadget specs and other long Markdown documents.

* One Canvas per file.
* Full-document writes on every change.
* No top-level ``` wrapping.
* Specs remain stable, copy/paste-safe, and traceable via `$VER` and history.

END OF CXP PACKET