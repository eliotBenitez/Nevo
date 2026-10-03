# Security Policy

Nevo is a local-first desktop application built on Tauri v2. Your notes, assets, and
workspace metadata live on your own device, and most of the attack surface is therefore
local: files you open, content you import, and plugins you install.

We take security reports seriously and appreciate the time researchers spend on them.

## Supported Versions

Nevo is pre-1.0 and ships from a single release line. Security fixes land in the next
release; there are no long-term support branches.

| Version | Supported |
| --- | --- |
| Latest release (`0.2.x`) | ✅ |
| Older releases | ❌ — please update |

Builds are distributed through the [Releases page](https://github.com/eliotBenitez/Nevo/releases/latest)
and updates are delivered by the Tauri updater with minisign signature verification.
Only install Nevo from official releases or from source you built yourself.

## Reporting a Vulnerability

**Do not open a public issue for a security vulnerability.**

Report privately through GitHub Security Advisories:

👉 **[Report a vulnerability](https://github.com/eliotBenitez/Nevo/security/advisories/new)**
(repository → *Security* → *Report a vulnerability*)

Please include:

- affected version, OS, and installation method (installer, AppImage, Flatpak, from source);
- a description of the issue and the security impact;
- reproduction steps or a minimal proof of concept;
- any relevant logs, sample workspace, or malicious input file.

### What to expect

| Stage | Target |
| --- | --- |
| Acknowledgement of the report | within 5 days |
| Initial assessment and severity triage | within 14 days |
| Fix or mitigation plan for confirmed issues | discussed in the advisory thread |

Nevo is maintained by a small team, so timelines are best-effort rather than contractual.
Please give us a reasonable window to ship a fix before public disclosure. Reporters are
credited in the advisory and the release notes unless they prefer to stay anonymous.

There is no bug bounty program.

## Scope

### In scope

- **Tauri IPC commands** (`src-tauri/src/commands`) — path traversal outside the workspace,
  argument validation gaps, unchecked filesystem writes, data-loss fallbacks.
- **Plugin sandbox escapes** (`src/editor-core/plugin-host`) — a marketplace (SDK V2) plugin
  reaching the DOM, the filesystem, Tauri IPC, or capabilities it was not granted.
- **Capability enforcement** — a plugin performing an action the user never approved.
- **Content rendering** — XSS or code execution via note content, HTML/SVG sanitization,
  Mermaid/KaTeX rendering, or embedded previews.
- **Import and export paths** — Markdown, Notion, Obsidian, DOCX, and Typst/PDF handling of
  hostile archives or filenames (zip-slip, symlink escapes, resource exhaustion).
- **The local media server** (`src-tauri/src/media_server`) — unintended exposure of
  workspace content.
- **The updater** — signature verification bypass or downgrade attacks.
- **Workspace data integrity** — silent corruption or loss of notes, manifests, or SQLite data.

### Out of scope

- Attacks that require an attacker who already has arbitrary code execution or full filesystem
  access on the user's machine.
- Third-party plugins acting *within* the capabilities the user explicitly granted them.
  Installing a plugin is a trust decision; see [docs/plugin-security.md](docs/plugin-security.md)
  and [docs/plugin-capabilities.md](docs/plugin-capabilities.md).
- Vulnerability-scanner output for dependencies without a working exploit path in Nevo.
- Missing hardening flags, best-practice deviations, or version disclosure with no demonstrated impact.
- Social engineering, physical access, and denial of service achieved by the user against their own device.

## Security Model

- **Local-first by default.** Nevo makes no network requests for your content. The only
  networking is opt-in update checks.
- **Untrusted input.** Filesystem paths, imported documents, rendered HTML/SVG, URLs, and Tauri
  IPC payloads are treated as untrusted and validated at each boundary.
- **Least privilege.** Backend access is gated by Tauri v2 capabilities
  (`src-tauri/capabilities`), and the webview runs under a restrictive Content Security Policy.
- **Plugin isolation.** SDK V2 plugins run in a Worker with no DOM, no filesystem, no direct
  network access, and no Tauri IPC. They communicate over a versioned, size- and
  timeout-limited RPC protocol, and every message crossing into the host is re-validated.
  A successful manifest check does not make later messages trusted.
- **Signed updates.** Release artifacts are verified against a minisign public key pinned in
  the application before installation.
- **Backward compatibility.** Workspace manifests, note content, assets, and SQLite data are
  migrated rather than silently replaced.

## Hardening Recommendations

- Keep Nevo updated — only the latest release receives security fixes.
- Install plugins only from sources you trust, and review the capabilities requested at
  install time.
- Back up your workspace directory; it is plain files on your disk.

## Security-Sensitive Contributions

Changes to `src-tauri/src/commands`, `src-tauri/src/media_server`,
`src-tauri/capabilities`, or `src/tauri` require explicit review of their filesystem, network,
and permission impact. See [AGENTS.md](AGENTS.md) for the full contributor requirements.
