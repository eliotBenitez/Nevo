# 0004 — PDF export renders through Typst in Rust, not the webview

**Status:** Accepted, September 2026.

## Context

The obvious way to export a PDF from a webview application is to print the rendered document. It is also the way that fails on this application's primary Linux target.

- **WebKitGTK renders `<foreignObject>` embedded in images as blank.** Diagrams, formulas and charts are exactly the content that reaches the page that way, so the blocks a user most wants in a PDF are the ones that disappear — silently, and only on Linux.
- **Printing exports what the screen shows.** Page size, margins, page breaks, and headers become a function of the current viewport and theme rather than an export setting.
- **The output is not reproducible.** The same note yields different PDFs across platforms and webview versions, which makes the failure above hard to even notice in review.

## Decision

PDF export does not go through the webview. The note is serialized to a Typst document and rendered to PDF by the `typst` crates inside the Rust backend (`src-tauri/src/commands/typst_export.rs`).

The pipeline is: `NoteDocument` → `src/utils/noteExport/buildTypstExport.ts` → `src/utils/noteExport/typstSerializer.ts` → `.typ` source → Typst in Rust → PDF.

Content the format cannot express directly is converted to native SVG before it reaches Typst — `mermaidToSvg.ts`, `mathToSvg.ts`, `vegaToSvg.ts` and `markmapToSvg.ts`, all under `src/utils/noteExport/` — never by rasterizing HTML-in-SVG. KaTeX/LaTeX math is translated to Typst's own math syntax by `src/utils/noteExport/latexToTypstMath.ts` rather than being rendered to an image.

Fonts are embedded through `typst-as-lib`'s embedded font kit, so output does not depend on what is installed on the user's machine.

## Consequences

- PDF output is byte-reproducible across platforms and independent of the webview, the theme, and the viewport.
- Every block type needs an explicit Typst representation. A new block silently vanishes from PDF unless it is added to the Typst serializer — this is the single most commonly skipped step when adding a block type, and it produces no error. See the export-surface checklist for adding a block.
- Export is CPU-heavy and runs in the Rust host, so it must stay off the async runtime's main thread (`spawn_blocking`).
- Typst's capabilities, not CSS, bound what a PDF can look like. Matching the on-screen rendering exactly is not a goal.
- `latexToTypstMath.ts` is a translation layer between two math syntaxes and is therefore permanently incomplete. It has dedicated symbol and accent test suites; extend them when extending it.

## Related

The same WebKitGTK `<foreignObject>` constraint applies to any export path that rasterizes HTML inside SVG. Prefer native SVG text and path content everywhere, not only here.
