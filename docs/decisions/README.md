# Architecture Decision Records

A decision belongs here when knowing *why* changes what a reasonable implementation looks like — and the code alone cannot tell you. Removals are the clearest case: a feature that was deliberately taken out leaves residue that reads like an incomplete migration, and without a record someone eventually "fixes" it by putting the feature back.

Do not write an ADR for a decision the code already states plainly, or for a routine choice with no live alternative.

## Index

| # | Decision | Date | Status |
| --- | --- | --- | --- |
| [0001](0001-note-json-single-source-of-truth.md) | `note.json` is a note's sole source of truth; Yjs and collaboration removed | 2026-09 | Accepted |
| [0002](0002-remove-cloud-workspaces.md) | Cloud workspaces, shared storages, teams and OAuth removed | 2026-09 | Accepted |
| [0003](0003-workspace-manifest-compatibility.md) | Reject newer manifests, open older ones unchanged, preserve unknown fields | 2026-09 | Accepted |
| [0004](0004-pdf-export-via-typst.md) | PDF export renders through Typst in Rust, not the webview | 2026-09 | Accepted |

## Writing one

Keep it to one page. Five headings, in this order:

- **Status** — Proposed / Accepted / Superseded by #N. Never delete a superseded record; mark it.
- **Context** — the forces that made a decision necessary. Constraints, not narrative.
- **Decision** — what was chosen, in the present tense.
- **Consequences** — what this costs, what it rules out, what now needs care.
- **Residue** (removals only) — the code that legitimately survives the removal, and why. Anything not on this list is stale and should be deleted, not revived.

Record the decision, not the implementation. If a paragraph would go stale when someone renames a file, it belongs in `ARCHITECTURE.md` or `docs/data-model.md` instead.

Number files sequentially and never renumber. Add the row to the index above in the same change, and link the record from the relevant section of `AGENTS.md` when it constrains how agents should work.
