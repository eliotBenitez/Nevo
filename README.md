<p align="center">
  <img src="public/logo.png" width="128" alt="Nevo Logo">
</p>

<h1 align="center">Nevo</h1>

<p align="center">
  <strong>A premium, local-first workspace for your knowledge.</strong><br>
  Beautiful. Fast. Yours.
</p>

<p align="center">
  📖 <a href="readme/README_RU.md"><strong>Русская версия README</strong></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Tauri-v2-FFC131?logo=tauri&logoColor=white" alt="Tauri">
  <img src="https://img.shields.io/badge/Vue-3.5-4FC08D?logo=vue.js&logoColor=white" alt="Vue 3">
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/License-AGPL--3.0-blue.svg" alt="License">
</p>

<p align="center">
  <a href="https://github.com/eliotBenitez/Nevo/releases/latest"><strong>⬇️ Download</strong></a>
  &nbsp;·&nbsp;
  <a href="#-features"><strong>Features</strong></a>
  &nbsp;·&nbsp;
  <a href="#-build-from-source"><strong>Build from source</strong></a>
</p>

---

**Nevo** is a minimalist desktop app for organizing your knowledge — inspired by Notion, Obsidian, and SiYuan. It pairs a distraction-free writing experience with an elegant Glassmorphism interface, and everything you create stays on your own device.

## 📸 Screenshots

<table align="center">
  <tr>
    <td><img src="settings/Screen Shot 2026-05-15 at 00.33.36.png" width="400"></td>
    <td><img src="settings/Screen Shot 2026-05-15 at 00.33.38.png" width="400"></td>
  </tr>
  <tr>
    <td><img src="settings/Screen Shot 2026-05-15 at 00.33.45.png" width="400"></td>
    <td><img src="settings/Screen Shot 2026-05-15 at 00.33.49.png" width="400"></td>
  </tr>
  <tr>
    <td><img src="settings/Screen Shot 2026-05-15 at 00.33.54.png" width="400"></td>
    <td><img src="settings/Screen Shot 2026-05-15 at 00.34.02.png" width="400"></td>
  </tr>
</table>

## ✨ Features

- 🔒 **Local-first** — your notes live on your device, not in someone else's cloud.
- ✍️ **WYSIWYG editor** — a powerful ProseMirror editor with Markdown that formats as you type.
- 🧩 **Rich blocks** — tables with formulas, diagrams (Mermaid), math (KaTeX), drawings, graphs, and more.
- ✨ **Glassmorphism design** — a modern, translucent interface with soft blur that keeps the focus on your content.
- ⌨️ **Keyboard-first** — fly through everything with hotkeys and slash commands.
- 🚀 **Fast & lightweight** — instant startup powered by Tauri and Vue 3.

## ⬇️ Download

Grab the latest installer for your OS from the **[Releases page](https://github.com/eliotBenitez/Nevo/releases/latest)**:

| Platform | Installer |
| --- | --- |
| 🪟 **Windows** | `.msi` or `.exe` |
| 🍏 **macOS** | `.dmg` (Apple Silicon & Intel) |
| 🐧 **Linux** | `.deb`, `.rpm`, AppImage, or Flatpak |

Nevo updates itself automatically once installed. 🎉

<details>
<summary>🍏 macOS: first launch is blocked? (unnotarized build)</summary>

macOS builds are ad-hoc signed but **not notarized**, so Gatekeeper blocks the first launch. After moving **Nevo.app** to `/Applications`, do one of the following once:

- Right-click the app → **Open** → **Open**, **or**
- Run in Terminal:
  ```bash
  xattr -dr com.apple.quarantine /Applications/Nevo.app
  ```

</details>

## 🧑‍💻 Build from Source

Prefer to build it yourself? You only need three tools — **Node.js v20+**, **pnpm**, and **Rust (stable)** — plus your platform's WebView/build libraries (details below).

```bash
git clone https://github.com/eliotBenitez/Nevo.git
cd Nevo

pnpm install        # install frontend dependencies
pnpm tauri dev      # run the app in development mode
pnpm tauri build    # build production installers (.deb / .rpm / AppImage / .dmg / .msi / .exe)
```

<details>
<summary>Install Rust & pnpm (all platforms)</summary>

```bash
# Rust (rustup) — macOS / Linux
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# pnpm via Corepack (included in Node.js ≥ 16.10)
corepack enable && corepack prepare pnpm@latest --activate
```

On **Windows**, install Rust with the [`rustup-init.exe`](https://rustup.rs) installer.

</details>

<details>
<summary>🐧 Linux system libraries</summary>

Tauri v2 needs `webkit2gtk-4.1` (WebView engine), `libsoup-3.0`, GTK3, `librsvg2`, `openssl`, an optional tray (`libappindicator/ayatana`), and a build toolchain (`gcc`, `make`, `pkg-config`).

**Debian / Ubuntu (apt):**
```bash
sudo apt update
sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

**Fedora (dnf):**
```bash
sudo dnf install -y webkit2gtk4.1-devel openssl-devel curl wget file \
  libappindicator-gtk3-devel librsvg2-devel
sudo dnf group install -y "c-development" "development-tools"
```

**Arch / Manjaro (pacman):**
```bash
sudo pacman -S --needed webkit2gtk-4.1 base-devel curl wget file openssl \
  appmenu-gtk-module librsvg
# Tray support (optional) — package from AUR:
# yay -S libappindicator-gtk3
```

**openSUSE (zypper):**
```bash
sudo zypper in -y webkit2gtk3-soup2-devel libopenssl-devel curl wget file \
  libappindicator3-1 librsvg-devel
sudo zypper in -t pattern -y devel_basis
```
> If the package is not found on your openSUSE version, check its name with `zypper se webkit2gtk` (Tauri v2 needs the soup3 variant, named `webkit2gtk3-devel` in some releases).

</details>

<details>
<summary>🍏 macOS build tools</summary>

The WebView (WKWebView) is built into the OS — no separate engine needed, just compilation tools.

1. **Xcode Command Line Tools** (C/clang compiler, linker):
   ```bash
   xcode-select --install
   ```
2. **Node.js v20+** — via [Homebrew](https://brew.sh) or the official installer:
   ```bash
   brew install node
   ```
3. **Rust** and **pnpm** — see "Install Rust & pnpm" above.

> Apple Silicon (`aarch64`) and Intel (`x86_64`) are both supported. For a universal binary, add the second target (e.g. `rustup target add x86_64-apple-darwin`) and build with `pnpm tauri build --target universal-apple-darwin`.

</details>

<details>
<summary>🪟 Windows build tools</summary>

1. **Microsoft C++ Build Tools** — install [Build Tools for Visual Studio](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the **"Desktop development with C++"** workload (MSVC + Windows SDK).
2. **WebView2 Runtime** — pre-installed on Windows 11 and recent Windows 10. If missing, get the [Evergreen WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/).
3. **Rust** — run [`rustup-init.exe`](https://rustup.rs) (MSVC toolchain `stable-x86_64-pc-windows-msvc`).
4. **Node.js v20+** — official installer or `winget install OpenJS.NodeJS`; then `corepack enable`.

> Install everything at once with [winget](https://learn.microsoft.com/windows/package-manager/):
> ```powershell
> winget install Microsoft.VisualStudio.2022.BuildTools Rustlang.Rustup OpenJS.NodeJS Microsoft.EdgeWebView2Runtime
> ```

</details>

<details>
<summary>📦 GStreamer — needed only for AppImage builds</summary>

Only required for `pnpm tauri build` when packaging an **AppImage** (`bundleMediaFramework` is enabled in `tauri.conf.json`). Not needed for `pnpm tauri dev`.

| Distribution | Packages |
| --- | --- |
| Debian/Ubuntu | `libgstreamer1.0-dev libgstreamer-plugins-base1.0-dev gstreamer1.0-plugins-good gstreamer1.0-plugins-bad gstreamer1.0-plugins-ugly gstreamer1.0-libav` |
| Fedora | `gstreamer1-plugins-base gstreamer1-plugins-good gstreamer1-plugins-bad-free gstreamer1-plugins-ugly-free gstreamer1-libav` |
| Arch | `gst-plugins-base gst-plugins-good gst-plugins-bad gst-plugins-ugly gst-libav` |
| openSUSE | `gstreamer-plugins-base gstreamer-plugins-good gstreamer-plugins-bad gstreamer-plugins-ugly gstreamer-plugins-libav` |

</details>

## 🛠 Tech Stack

| | |
| --- | --- |
| **Backend** | [Tauri](https://tauri.app/) (Rust) |
| **Frontend** | [Vue 3](https://vuejs.org/) (Composition API) |
| **Language** | [TypeScript](https://www.typescriptlang.org/) |
| **Editor** | [ProseMirror](https://prosemirror.net/) |
| **State** | [Pinia](https://pinia.vuejs.org/) |
| **Build** | [Vite](https://vitejs.dev/) |
| **Styling** | CSS design tokens & global project styles |

## 🏗 Architecture

Nevo follows strict architectural boundaries to stay maintainable:

- `src/app/` — core application shell and layouts.
- `src/editor-core/` — isolated ProseMirror logic (schema, plugins, commands).
- `src/features/` — modular features (graphs, databases, onboarding).
- `src/ui/` — reusable interface primitives and animations.
- `src-tauri/` — Rust source for the desktop backend.

> **Note:** ProseMirror editor state is kept strictly out of Vue/Pinia to avoid performance and reactivity issues.

## 📄 License

Nevo is licensed under the **AGPL-3.0** License. See [LICENSE](LICENSE) for details.
