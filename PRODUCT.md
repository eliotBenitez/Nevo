# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Tauri v2 desktop app (Windows, macOS, Linux) rendered in system webviews (WebView2, WKWebView, WebKitGTK), plus an Android build (Android WebView). The design language is one web language, not per-OS native.

## Users

People keeping a personal knowledge base on their own device: study notes, research, projects, journals. They write and reread alone, often for long sessions, and care more about privacy and ownership than about cloud features.

## Product Purpose

Nevo is a local-first workspace for knowledge: a distraction-free editor plus canvas, graph, kanban, databases, and drawing, with every note stored on the user's disk. Success is a user who trusts Nevo with years of notes and finds what they wrote again.

## Positioning

Local-first by construction: a note's `note.json` on disk is its only source of truth, with no account, sync server, or collaboration layer. AI follows the same rule: a local Ollama model is the default provider, and a privacy mode restricts AI to loopback endpoints.

## Operating Context

Long writing and reading sessions on desktop, keyboard-heavy; touch on Android phones and tablets. Users move between notes via the sidebar tree, tabs, search palette, wiki-links, and the graph.

## Capabilities and Constraints

- AI providers: Ollama (default, `http://localhost:11434`) and any OpenAI-compatible endpoint with an optional API key; streaming completions; privacy mode blocks non-local endpoints.
- Existing AI surfaces: AI slash-menu items and an "Ask AI" prompt modal inside the editor.
- Planned AI chat (confirmed scope): a floating assistant opened from a launcher in the bottom-right corner, answering over the whole workspace, with actions to insert an answer into the note, replace the selection, copy, and create a new note. Workspace-wide retrieval does not exist yet and is a new subsystem.
- Removed and not to be reintroduced: collaboration/Yjs, cloud workspaces, shared storage, teams, OAuth.
- Locales: en, ru, fr, es, de.

## Brand Commitments

- Name: Nevo. Tagline in README: "A premium, local-first workspace for your knowledge."
- Borderless frame-and-island interface; Geist and Geist Mono; Lucide icons; Mineral (muted teal) default accent with user-selectable presets; light and dark themes. Visual reference: `docs/design/nevo-reference.html`, spec `docs/superpowers/specs/2026-09-22-solid-ui-redesign-design.md`.

## Evidence on Hand

- Screenshots: `readme/screens/`.
- No user testimonials, usage metrics, or benchmarks exist; do not fabricate them.

## Product Principles

1. The user's disk is the source of truth; nothing leaves the device unless the user points it somewhere.
2. The document outranks the interface: chrome stays quiet so writing stays in focus.
3. AI is an assistant to the user's own notes, never a replacement for them; every AI change to a note is explicit and reviewable.
4. Keyboard first, touch capable.

## Accessibility & Inclusion

Preserve keyboard operation, visible focus, WCAG non-text contrast for controls, reduced-motion behavior, and usable touch targets on Android.
