<p align="center">
  <img src="public/logo.png" width="120" alt="Nevo Logo">
</p>

<h1 align="center">Nevo</h1>

<p align="center">
  <strong>Premium next-generation workspace for your knowledge</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Tauri-v2-FFC131?logo=tauri&logoColor=white" alt="Tauri">
  <img src="https://img.shields.io/badge/Vue-3.5-4FC08D?logo=vue.js&logoColor=white" alt="Vue 3">
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License">
</p>

---

**Nevo** is a minimalist, desktop-based knowledge management application inspired by Notion, Obsidian, and SiYuan. We create a workspace where high performance meets elegant Glassmorphism visual style.

## ✨ Features

- 🔒 **Local-first**: Your data belongs to you. Everything is stored locally on your device.
- ✍️ **WYSIWYG Editor**: A powerful ProseMirror-based editor with on-the-fly Markdown support.
- ✨ **Glassmorphism Design**: Modern, translucent interface with soft blur and emphasis on content.
- ⌨️ **Keyboard-first**: Optimized for mouse-free operation using hotkeys and slash commands.
- 🚀 **Performance**: Blazing fast startup and performance powered by Tauri and Vue 3.

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

## 🛠 Tech Stack

- **Backend:** [Tauri](https://tauri.app/) (Rust)
- **Frontend:** [Vue 3](https://vuejs.org/) (Composition API)
- **Language:** [TypeScript](https://www.typescriptlang.org/)
- **Styling:** CSS design tokens and project global styles
- **Editor:** [ProseMirror](https://prosemirror.net/)
- **State Manager:** [Pinia](https://pinia.vuejs.org/)
- **Bundler:** [Vite](https://vitejs.dev/)

## 🚀 Quick Start

### Requirements

| Component | Version | Purpose |
| --- | --- | --- |
| **Node.js** | v20+ | Frontend build (Vite) |
| **pnpm** | latest | Package manager (uses `pnpm-lock.yaml`) |
| **Rust** | stable | Tauri v2 backend |
| **System Libraries** | see below | Tauri WebView engine and GTK stack |

Tauri v2 uses each OS's **system WebView**: `webkit2gtk-4.1` on Linux, WKWebView on macOS (built-in), and WebView2 on Windows. Platform setup details are below.

### 1. Basic Tools (all OS)

```bash
# Rust (rustup) — macOS / Linux
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# pnpm via Corepack (included in Node.js ≥ 16.10)
corepack enable && corepack prepare pnpm@latest --activate
```

On **Windows**, install Rust using the [`rustup-init.exe`](https://rustup.rs) installer (see the Windows section below).

---

## 🐧 Linux

A native **Tauri v2** stack is required: `webkit2gtk-4.1` (WebView engine), `libsoup-3.0` (HTTP, pulled in by WebKit dependency), GTK3, `librsvg2`, `openssl`, optional tray support `libappindicator/ayatana`, and build toolchain (`gcc`, `make`, `pkg-config`).

### System Libraries by Distribution

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
> If the package is not found on your version of openSUSE, verify its name: `zypper se webkit2gtk` (Tauri v2 requires the version with soup3 support, which is named `webkit2gtk3-devel` in some releases).

### GStreamer — for AppImage build only (optional)

Only required for `pnpm tauri build` when packaging as an **AppImage** (when `bundleMediaFramework` is enabled in `tauri.conf.json`). Not required for `pnpm tauri dev`.

| Distribution | Packages |
| --- | --- |
| Debian/Ubuntu | `libgstreamer1.0-dev libgstreamer-plugins-base1.0-dev gstreamer1.0-plugins-good gstreamer1.0-plugins-bad gstreamer1.0-plugins-ugly gstreamer1.0-libav` |
| Fedora | `gstreamer1-plugins-base gstreamer1-plugins-good gstreamer1-plugins-bad-free gstreamer1-plugins-ugly-free gstreamer1-libav` |
| Arch | `gst-plugins-base gst-plugins-good gst-plugins-bad gst-plugins-ugly gst-libav` |
| openSUSE | `gstreamer-plugins-base gstreamer-plugins-good gstreamer-plugins-bad gstreamer-plugins-ugly gstreamer-plugins-libav` |

---

## 🍏 macOS

The WebView (WKWebView) is built-in — no separate engine installation is needed. Only compilation tools are required.

1. **Xcode Command Line Tools** (C compiler/clang, linker):
   ```bash
   xcode-select --install
   ```
2. **Node.js v20+** — via [Homebrew](https://brew.sh) or the official installer:
   ```bash
   brew install node
   ```
3. **Rust** and **pnpm** — see the "Basic Tools" section above.

> Apple Silicon (`aarch64`) and Intel (`x86_64`) are both supported. To cross-compile a universal binary, add the second target, e.g. `rustup target add x86_64-apple-darwin`, and build using `pnpm tauri build --target universal-apple-darwin`.

---

## 🪟 Windows

1. **Microsoft C++ Build Tools** — install [Build Tools for Visual Studio](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the **"Desktop development with C++"** workload (MSVC + Windows SDK).
2. **WebView2 Runtime** — pre-installed in Windows 11 and recent versions of Windows 10. If missing, download the [Evergreen WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/).
3. **Rust** — run [`rustup-init.exe`](https://rustup.rs) (uses the `stable-x86_64-pc-windows-msvc` MSVC toolchain).
4. **Node.js v20+** — official installer or `winget install OpenJS.NodeJS`; then `corepack enable`.

Run the commands below in **PowerShell** or **Windows Terminal**.

> Alternative: install everything at once using [winget](https://learn.microsoft.com/windows/package-manager/):
> ```powershell
> winget install Microsoft.VisualStudio.2022.BuildTools Rustlang.Rustup OpenJS.NodeJS Microsoft.EdgeWebView2Runtime
> ```

---

## 🧩 Project Setup (all OS)

```bash
git clone https://github.com/your-username/nevo.git
cd nevo

pnpm install        # install frontend dependencies
pnpm tauri dev      # run in development mode
pnpm tauri build    # production build (.deb / .rpm / AppImage / .dmg / .msi / .exe)
```

## 🏗 Architecture

The project follows strict architectural principles to ensure maintainability:

- `src/app/`: Core application shell and layouts.
- `src/editor-core/`: Isolated ProseMirror logic (schema, plugins, commands).
- `src/features/`: Modular feature implementations (graphs, databases, onboarding).
- `src/ui/`: Reusable interface primitives and animations.
- `src-tauri/`: Rust source code for the desktop backend.

**Important:** ProseMirror editor state is strictly isolated from Vue/Pinia to prevent performance and reactivity issues.

## 📄 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
