<p align="center">
  <img src="public/logo.png" width="120" alt="Nevo Logo">
</p>

<h1 align="center">Nevo</h1>

<p align="center">
  <strong>Премиальное рабочее пространство для знаний нового поколения</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Tauri-v2-FFC131?logo=tauri&logoColor=white" alt="Tauri">
  <img src="https://img.shields.io/badge/Vue-3.5-4FC08D?logo=vue.js&logoColor=white" alt="Vue 3">
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License">
</p>

---

**Nevo** — это минималистичное, десктопное приложение для организации знаний, вдохновленное Notion, Obsidian и SiYuan. Мы создаем пространство, где высокая производительность сочетается с элегантным визуальным стилем Glassmorphism.

## ✨ Особенности

- 🔒 **Local-first**: Ваши данные принадлежат только вам. Все хранится локально на вашем устройстве.
- ✍️ **WYSIWYG Редактор**: Мощный редактор на базе ProseMirror с поддержкой Markdown "на лету".
- ✨ **Glassmorphism Дизайн**: Современный, полупрозрачный интерфейс с мягким размытием и акцентом на контент.
- ⌨️ **Keyboard-first**: Оптимизировано для быстрой работы без мыши через горячие клавиши и слэш-команды.
- 🚀 **Производительность**: Невероятно быстрый запуск и работа благодаря Tauri и Vue 3.

## 📸 Скриншоты

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

## 🛠 Технологический стек

- **Backend:** [Tauri](https://tauri.app/) (Rust)
- **Frontend:** [Vue 3](https://vuejs.org/) (Composition API)
- **Язык:** [TypeScript](https://www.typescriptlang.org/)
- **Стилизация:** CSS design tokens и глобальные стили проекта
- **Редактор:** [ProseMirror](https://prosemirror.net/)
- **Стейт-менеджер:** [Pinia](https://pinia.vuejs.org/)
- **Сборка:** [Vite](https://vitejs.dev/)

## 🚀 Быстрый старт

### Требования

| Компонент | Версия | Назначение |
| --- | --- | --- |
| **Node.js** | v20+ | Сборка фронтенда (Vite) |
| **pnpm** | актуальная | Менеджер пакетов (в репозитории `pnpm-lock.yaml`) |
| **Rust** | stable | Бэкенд Tauri v2 |
| **Системные библиотеки** | см. ниже | WebView-движок и GTK-стек Tauri |

Tauri v2 использует **системный WebView** каждой ОС: на Linux — `webkit2gtk-4.1`, на macOS — WKWebView (встроен), на Windows — WebView2. Ниже — установка для каждой платформы.

### 1. Базовые инструменты (любая ОС)

```bash
# Rust (rustup) — macOS / Linux
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# pnpm через Corepack (входит в Node.js ≥ 16.10)
corepack enable && corepack prepare pnpm@latest --activate
```

На **Windows** Rust ставится установщиком [`rustup-init.exe`](https://rustup.rs) (см. раздел Windows ниже).

---

## 🐧 Linux

Нужен нативный стек **Tauri v2**: `webkit2gtk-4.1` (движок WebView), `libsoup-3.0` (HTTP, тянется зависимостью WebKit), GTK3, `librsvg2`, `openssl`, опциональный трей `libappindicator/ayatana` и build-тулчейн (`gcc`, `make`, `pkg-config`).

### Системные библиотеки по дистрибутивам

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
# Трей (опционально) — пакет из AUR:
# yay -S libappindicator-gtk3
```

**openSUSE (zypper):**
```bash
sudo zypper in -y webkit2gtk3-soup2-devel libopenssl-devel curl wget file \
  libappindicator3-1 librsvg-devel
sudo zypper in -t pattern -y devel_basis
```
> Если на вашей версии openSUSE пакет не найден, проверьте имя: `zypper se webkit2gtk` (для Tauri v2 нужен вариант с поддержкой soup3, в части релизов он называется `webkit2gtk3-devel`).

### GStreamer — только для сборки AppImage (опционально)

Требуется лишь для `pnpm tauri build` при упаковке в **AppImage** (в `tauri.conf.json` включён `bundleMediaFramework`). Для `pnpm tauri dev` не нужен.

| Дистрибутив | Пакеты |
| --- | --- |
| Debian/Ubuntu | `libgstreamer1.0-dev libgstreamer-plugins-base1.0-dev gstreamer1.0-plugins-good gstreamer1.0-plugins-bad gstreamer1.0-plugins-ugly gstreamer1.0-libav` |
| Fedora | `gstreamer1-plugins-base gstreamer1-plugins-good gstreamer1-plugins-bad-free gstreamer1-plugins-ugly-free gstreamer1-libav` |
| Arch | `gst-plugins-base gst-plugins-good gst-plugins-bad gst-plugins-ugly gst-libav` |
| openSUSE | `gstreamer-plugins-base gstreamer-plugins-good gstreamer-plugins-bad gstreamer-plugins-ugly gstreamer-plugins-libav` |

---

## 🍏 macOS

WebView (WKWebView) встроен в систему — отдельный движок ставить не нужно. Нужны только инструменты компиляции.

1. **Xcode Command Line Tools** (компилятор C/clang, линкер):
   ```bash
   xcode-select --install
   ```
2. **Node.js v20+** — через [Homebrew](https://brew.sh) или официальный установщик:
   ```bash
   brew install node
   ```
3. **Rust** и **pnpm** — см. раздел «Базовые инструменты» выше.

> Поддерживаются Apple Silicon (`aarch64`) и Intel (`x86_64`). Для кросс-сборки universal-бинарника установите вторую цель, напр. `rustup target add x86_64-apple-darwin`, и собирайте с `pnpm tauri build --target universal-apple-darwin`.

---

## 🪟 Windows

1. **Microsoft C++ Build Tools** — установите [Build Tools for Visual Studio](https://visualstudio.microsoft.com/visual-cpp-build-tools/) с компонентом **«Desktop development with C++»** (MSVC + Windows SDK).
2. **WebView2 Runtime** — предустановлен в Windows 11 и актуальных Windows 10. При отсутствии скачайте [Evergreen WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/).
3. **Rust** — запустите [`rustup-init.exe`](https://rustup.rs) (использует MSVC-тулчейн `stable-x86_64-pc-windows-msvc`).
4. **Node.js v20+** — официальный установщик или `winget install OpenJS.NodeJS`; затем `corepack enable`.

Команды ниже выполняйте в **PowerShell** или **Windows Terminal**.

> Альтернатива: всё разом через [winget](https://learn.microsoft.com/windows/package-manager/):
> ```powershell
> winget install Microsoft.VisualStudio.2022.BuildTools Rustlang.Rustup OpenJS.NodeJS Microsoft.EdgeWebView2Runtime
> ```

---

## 🧩 Сборка проекта (любая ОС)

```bash
git clone https://github.com/your-username/nevo.git
cd nevo

pnpm install        # зависимости фронтенда
pnpm tauri dev      # запуск в режиме разработки
pnpm tauri build    # production-сборка (.deb / .rpm / AppImage / .dmg / .msi / .exe)
```

## 🏗 Архитектура

Проект следует строгим архитектурным принципам для обеспечения поддерживаемости:

- `src/app/`: Основная оболочка приложения и макеты.
- `src/editor-core/`: Изолированная логика ProseMirror (схемы, плагины, команды).
- `src/features/`: Модульные реализации функций (графы, базы данных, онбординг).
- `src/ui/`: Многоразовые примитивы интерфейса и анимации.
- `src-tauri/`: Исходный код Rust для десктопного бэкенда.

**Важно:** Состояние редактора ProseMirror строго изолировано от Vue/Pinia для предотвращения проблем с производительностью и реактивностью.

## 📄 Лицензия

Этот проект распространяется под лицензией MIT. Подробности в файле [LICENSE](LICENSE).
