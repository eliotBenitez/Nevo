# Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the complete onboarding flow (Welcome → Create/Open workspace) in `src/` using the design templates from `features/` as reference, with vue-i18n (en + ru) and Tauri native folder picker.

**Architecture:** The `features/` root folder contains design reference files — actual source lives in `src/`. `main.ts` already imports `./router`, `./styles/tokens.css`, `./stores/theme` which don't exist yet in `src/`. The onboarding feature splits into: OnboardingView (orchestrator) → WelcomeHero | CreateWorkspace | OpenWorkspace; CreateWorkspace delegates identity and template picking to isolated subcomponents.

**Tech Stack:** Vue 3 + Composition API, vue-i18n v11 (legacy: false), Pinia, vue-router v5, @tauri-apps/plugin-dialog v2, Tailwind CSS v4, lucide-vue-next

> **Note on testing:** No test infrastructure (vitest/jest) exists in this project. TDD steps are replaced with TypeScript build checks (`pnpm build`) and visual verification via `pnpm tauri dev`.

---

## File Structure

### Created (new)

| File | Responsibility |
|---|---|
| `src/styles/tokens.css` | Design tokens, CSS variables, base classes |
| `src/stores/theme.ts` | Theme mode store (dark/light/system) |
| `src/stores/workspace.ts` | Workspace state + recent workspaces |
| `src/app/AppLayout.vue` | Minimal app shell stub (post-onboarding) |
| `src/router/index.ts` | Route definitions: `/` → Onboarding, `/app` → AppLayout |
| `src/locales/en.json` | English translations |
| `src/locales/ru.json` | Russian translations |
| `src/features/onboarding/composables/useWorkspacePicker.ts` | Tauri dialog wrapper |
| `src/features/onboarding/WorkspaceIdentityPicker.vue` | Name input + glyph + color picker |
| `src/features/onboarding/WorkspaceTemplatePicker.vue` | Template grid |
| `src/features/onboarding/WelcomeHero.vue` | Welcome screen with actions + recents |
| `src/features/onboarding/CreateWorkspace.vue` | Create workspace form (orchestrator) |
| `src/features/onboarding/OpenWorkspace.vue` | Open existing workspace screen |
| `src/features/onboarding/OnboardingView.vue` | Screen orchestrator with titlebar |

### Modified (existing)

| File | Change |
|---|---|
| `src/App.vue` | Add `nv-app` shell + `router-view` |
| `src/main.ts` | Import locale files, wire into i18n messages |
| `src-tauri/Cargo.toml` | Add `tauri-plugin-dialog = "2"` |
| `src-tauri/src/lib.rs` | Register `tauri_plugin_dialog::init()` |
| `src-tauri/capabilities/default.json` | Add `"dialog:allow-open"` permission |

---

## Task 1: Core styles and stores

**Files:**
- Create: `src/styles/tokens.css`
- Create: `src/stores/theme.ts`
- Create: `src/stores/workspace.ts`

- [ ] **Step 1: Create `src/styles/tokens.css`**

```css
@import url('https://fonts.googleapis.com/css2?family=Geist:wght@300;400;450;500;600;700&family=Geist+Mono:wght@400;500&family=Instrument+Serif:ital@0;1&display=swap');
@import "tailwindcss";

:root {
  --font-ui: 'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  --font-serif: 'Instrument Serif', 'Cambria', Georgia, serif;
  --font-mono: 'Geist Mono', 'JetBrains Mono', ui-monospace, monospace;

  --accent: oklch(0.66 0.10 258);
  --accent-soft: oklch(0.66 0.10 258 / 0.14);
  --accent-glow: oklch(0.66 0.10 258 / 0.32);

  --hue-rose:  oklch(0.72 0.06 18);
  --hue-amber: oklch(0.78 0.07 78);
  --hue-sage:  oklch(0.72 0.05 155);
  --hue-mist:  oklch(0.72 0.04 210);
  --hue-plum:  oklch(0.68 0.06 305);
}

.theme-dark {
  --canvas-0: oklch(0.16 0.012 270);
  --canvas-1: oklch(0.185 0.012 270);
  --wash-a: oklch(0.28 0.04 258);
  --wash-b: oklch(0.22 0.03 30);

  --glass-1: oklch(0.24 0.012 268 / 0.55);
  --glass-2: oklch(0.27 0.012 268 / 0.72);
  --glass-3: oklch(0.32 0.013 268 / 0.82);
  --glass-titlebar: oklch(0.20 0.012 268 / 0.70);

  --line-1: oklch(1 0 0 / 0.06);
  --line-2: oklch(1 0 0 / 0.10);
  --line-strong: oklch(1 0 0 / 0.16);
  --shadow-1: 0 1px 0 0 oklch(1 0 0 / 0.04) inset, 0 1px 2px oklch(0 0 0 / 0.3);
  --shadow-2: 0 12px 40px -8px oklch(0 0 0 / 0.45), 0 2px 6px oklch(0 0 0 / 0.3);
  --shadow-pop: 0 24px 60px -12px oklch(0 0 0 / 0.6), 0 2px 8px oklch(0 0 0 / 0.4),
                inset 0 1px 0 oklch(1 0 0 / 0.06);

  --text-1: oklch(0.96 0.005 268);
  --text-2: oklch(0.82 0.008 268);
  --text-3: oklch(0.66 0.010 268);
  --text-4: oklch(0.52 0.012 268);
  --text-inv: oklch(0.18 0 0);

  --hover: oklch(1 0 0 / 0.04);
  --hover-strong: oklch(1 0 0 / 0.07);
  --press: oklch(1 0 0 / 0.10);
  --selection: oklch(0.66 0.10 258 / 0.32);
}

.theme-light {
  --canvas-0: oklch(0.965 0.006 80);
  --canvas-1: oklch(0.985 0.005 80);
  --wash-a: oklch(0.86 0.04 258);
  --wash-b: oklch(0.92 0.03 30);

  --glass-1: oklch(1 0 0 / 0.55);
  --glass-2: oklch(1 0 0 / 0.72);
  --glass-3: oklch(1 0 0 / 0.86);
  --glass-titlebar: oklch(0.98 0.003 80 / 0.75);

  --line-1: oklch(0 0 0 / 0.06);
  --line-2: oklch(0 0 0 / 0.09);
  --line-strong: oklch(0 0 0 / 0.14);
  --shadow-1: 0 1px 0 0 oklch(1 0 0 / 0.8) inset, 0 1px 2px oklch(0 0 0 / 0.05);
  --shadow-2: 0 12px 40px -8px oklch(0.3 0.02 268 / 0.18), 0 2px 6px oklch(0.3 0.02 268 / 0.08);
  --shadow-pop: 0 24px 60px -12px oklch(0.3 0.02 268 / 0.25), 0 2px 8px oklch(0 0 0 / 0.08),
                inset 0 1px 0 oklch(1 0 0 / 0.9);

  --text-1: oklch(0.22 0.012 270);
  --text-2: oklch(0.36 0.012 270);
  --text-3: oklch(0.50 0.012 270);
  --text-4: oklch(0.62 0.012 270);
  --text-inv: oklch(0.98 0 0);

  --hover: oklch(0 0 0 / 0.03);
  --hover-strong: oklch(0 0 0 / 0.05);
  --press: oklch(0 0 0 / 0.07);
  --selection: oklch(0.66 0.10 258 / 0.20);
}

.nv-glass {
  background: var(--glass-2);
  backdrop-filter: blur(20px) saturate(140%);
  -webkit-backdrop-filter: blur(20px) saturate(140%);
  border: 1px solid var(--line-2);
}

.nv-card {
  background: var(--glass-3);
  backdrop-filter: blur(28px) saturate(150%);
  border: 1px solid var(--line-2);
  border-radius: 14px;
  box-shadow: var(--shadow-1);
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html, body, #app {
  width: 100%; height: 100%; overflow: hidden;
}

.nv-app {
  font-family: var(--font-ui);
  font-feature-settings: 'cv11', 'ss01';
  color: var(--text-1);
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  letter-spacing: -0.005em;
  -webkit-font-smoothing: antialiased;
}

.nv-canvas {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(60% 50% at 18% 12%, var(--wash-a) 0%, transparent 70%),
    radial-gradient(50% 40% at 95% 95%, var(--wash-b) 0%, transparent 70%),
    var(--canvas-0);
}

.nv-display { font-family: var(--font-serif); font-weight: 400; font-size: 38px; line-height: 1.1; letter-spacing: -0.015em; }
.nv-h1 { font-size: 28px; font-weight: 600; line-height: 1.2; letter-spacing: -0.02em; }
.nv-h2 { font-size: 20px; font-weight: 600; line-height: 1.3; letter-spacing: -0.015em; }
.nv-h3 { font-size: 16px; font-weight: 600; line-height: 1.35; letter-spacing: -0.01em; }
.nv-body { font-size: 14.5px; line-height: 1.65; color: var(--text-2); font-weight: 400; }
.nv-small { font-size: 12px; line-height: 1.5; color: var(--text-3); }
.nv-micro { font-size: 11px; line-height: 1.4; color: var(--text-4); letter-spacing: 0.02em; text-transform: uppercase; font-weight: 500; }
.nv-mono { font-family: var(--font-mono); font-size: 12.5px; }

.nv-btn {
  display: inline-flex; align-items: center; gap: 6px;
  height: 26px; padding: 0 10px;
  border-radius: 7px; border: 1px solid transparent;
  background: transparent; color: var(--text-2);
  font: 500 12.5px var(--font-ui); letter-spacing: -0.005em;
  cursor: pointer; transition: background .15s, color .15s, border-color .15s;
  white-space: nowrap;
}
.nv-btn:hover { background: var(--hover); color: var(--text-1); }
.nv-btn--ghost { border-color: var(--line-2); }
.nv-btn--primary {
  background: var(--accent); color: white; border-color: var(--accent);
  box-shadow: 0 1px 0 oklch(1 0 0 / 0.2) inset, 0 4px 12px var(--accent-glow);
}
.nv-btn--primary:hover { background: oklch(0.70 0.10 258); color: white; }

.nv-chip {
  display: inline-flex; align-items: center; gap: 4px;
  height: 20px; padding: 0 8px;
  border-radius: 100px; font-size: 11px; font-weight: 500;
  color: var(--text-2); background: var(--hover-strong);
  border: 1px solid var(--line-1);
}

.nv-kbd {
  font-family: var(--font-mono); font-size: 10.5px; font-weight: 500;
  color: var(--text-3); background: var(--hover-strong);
  border: 1px solid var(--line-2); border-bottom-width: 2px;
  border-radius: 4px; padding: 1px 5px; min-width: 16px; text-align: center;
  display: inline-flex; align-items: center; justify-content: center;
}

.nv-side-item {
  display: flex; align-items: center; gap: 8px;
  padding: 4px 10px; margin: 1px 6px;
  border-radius: 6px; font-size: 13px; font-weight: 450;
  color: var(--text-2); cursor: pointer;
  transition: background .12s, color .12s;
  line-height: 1.4; user-select: none;
}
.nv-side-item:hover { background: var(--hover); color: var(--text-1); }
.nv-side-item.is-active {
  background: var(--accent-soft); color: var(--text-1);
  box-shadow: inset 0 0 0 1px oklch(0.66 0.10 258 / 0.18);
}
.nv-side-icon { width: 14px; height: 14px; flex: 0 0 auto; color: var(--text-3); }
.nv-side-item.is-active .nv-side-icon { color: var(--accent); }
.nv-side-section {
  font-size: 10.5px; font-weight: 600; letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--text-4);
  padding: 6px 14px 4px;
}

.nv-block { position: relative; padding: 3px 0; }
.nv-block-handles {
  position: absolute; left: -42px; top: 8px;
  display: flex; gap: 2px;
  opacity: 0; transition: opacity .12s;
}
.nv-block:hover .nv-block-handles { opacity: 1; }
.nv-block-btn {
  width: 18px; height: 18px; border-radius: 4px;
  display: grid; place-items: center;
  color: var(--text-4); cursor: pointer;
  transition: background .12s, color .12s;
}
.nv-block-btn:hover { background: var(--hover); color: var(--text-2); }

.nv-sel { background: var(--selection); border-radius: 2px; padding: 0 1px; margin: 0 -1px; }

@keyframes nv-caret { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
.nv-caret {
  display: inline-block; width: 1.5px; height: 1.05em;
  vertical-align: -0.2em; background: var(--accent);
  border-radius: 1px; margin-left: 1px;
  animation: nv-caret 1.05s steps(1) infinite;
}

.nv-app, .nv-app * { scrollbar-width: none; }
.nv-app::-webkit-scrollbar, .nv-app *::-webkit-scrollbar { display: none; }
```

- [ ] **Step 2: Create `src/stores/theme.ts`**

```ts
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

type ThemeMode = 'dark' | 'light' | 'system'

export const useThemeStore = defineStore('theme', () => {
  const mode = ref<ThemeMode>('dark')
  const resolved = ref<'dark' | 'light'>('dark')

  function applyTheme(theme: 'dark' | 'light') {
    resolved.value = theme
    const root = document.documentElement
    root.classList.remove('theme-dark', 'theme-light')
    root.classList.add(`theme-${theme}`)
  }

  function resolveSystem() {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    applyTheme(prefersDark ? 'dark' : 'light')
  }

  function setMode(m: ThemeMode) {
    mode.value = m
    if (m === 'system') resolveSystem()
    else applyTheme(m)
  }

  watch(mode, () => {
    if (mode.value === 'system') {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', resolveSystem)
    }
  })

  function init() {
    applyTheme('dark')
  }

  return { mode, resolved, setMode, init }
})
```

- [ ] **Step 3: Create `src/stores/workspace.ts`**

```ts
import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface Page {
  id: string
  icon: string
  title: string
  children?: Page[]
  active?: boolean
}

export interface Workspace {
  id: string
  name: string
  path: string
  icon: string
  color: string
  pageCount: number
  lastOpened: string
  pinned?: boolean
}

export const useWorkspaceStore = defineStore('workspace', () => {
  const current = ref<Workspace | null>(null)
  const isOnboarding = ref(true)

  const recentWorkspaces = ref<Workspace[]>([
    {
      id: '1', name: "Eleanor's Atelier", path: '~/Documents/atelier',
      icon: 'N', color: 'linear-gradient(135deg, oklch(0.66 0.10 258), oklch(0.55 0.10 290))',
      pageCount: 1284, lastOpened: '2 hours ago', pinned: true,
    },
    {
      id: '2', name: 'Lab notebook', path: '~/Code/research-2025',
      icon: 'L', color: 'linear-gradient(135deg, oklch(0.7 0.10 145), oklch(0.6 0.08 200))',
      pageCount: 412, lastOpened: 'yesterday',
    },
    {
      id: '3', name: 'Personal journal', path: '~/Dropbox/journal',
      icon: 'P', color: 'linear-gradient(135deg, oklch(0.75 0.07 30), oklch(0.65 0.10 350))',
      pageCount: 96, lastOpened: '3 days ago',
    },
  ])

  const pages = ref<Page[]>([
    { id: 'research', icon: '🪐', title: 'Research', children: [
      { id: 'essays', icon: '📑', title: 'Long-form essays' },
      { id: 'experiments', icon: '🧪', title: 'Experiments' },
      { id: 'press', icon: '📰', title: 'Press clippings' },
    ]},
    { id: 'notebooks', icon: '📓', title: 'Notebooks', children: [
      { id: 'q4', icon: '◐', title: 'Q4 product strategy', active: true },
      { id: 'type', icon: '◑', title: 'Type design diary' },
      { id: 'lecture', icon: '◒', title: 'Lecture notes' },
    ]},
    { id: 'archive', icon: '🗂️', title: 'Archive' },
  ])

  const activePage = ref<Page>({ id: 'q4', icon: '◐', title: 'Q4 product strategy' })

  function openWorkspace(ws: Workspace) {
    current.value = ws
    isOnboarding.value = false
  }

  function createWorkspace(name: string, path: string) {
    const ws: Workspace = {
      id: Date.now().toString(), name, path,
      icon: 'N', color: 'linear-gradient(135deg, oklch(0.66 0.10 258), oklch(0.55 0.10 290))',
      pageCount: 0, lastOpened: 'just now',
    }
    current.value = ws
    isOnboarding.value = false
  }

  return { current, isOnboarding, recentWorkspaces, pages, activePage, openWorkspace, createWorkspace }
})
```

- [ ] **Step 4: Commit**

```bash
git add src/styles/tokens.css src/stores/theme.ts src/stores/workspace.ts
git commit -m "feat(onboarding): add styles tokens and workspace/theme stores"
```

---

## Task 2: Router, App shell, AppLayout stub

**Files:**
- Create: `src/router/index.ts`
- Modify: `src/App.vue`
- Create: `src/app/AppLayout.vue`

- [ ] **Step 1: Create `src/router/index.ts`**

```ts
import { createRouter, createWebHashHistory } from 'vue-router'
import OnboardingView from '../features/onboarding/OnboardingView.vue'
import AppLayout from '../app/AppLayout.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: OnboardingView },
    { path: '/app', component: AppLayout },
  ],
})
```

- [ ] **Step 2: Update `src/App.vue`**

```vue
<script setup lang="ts"></script>

<template>
  <div class="nv-app">
    <div class="nv-canvas" />
    <router-view />
  </div>
</template>
```

- [ ] **Step 3: Create `src/app/AppLayout.vue`** (minimal stub — full implementation is a separate task)

```vue
<script setup lang="ts"></script>

<template>
  <div style="position:absolute;inset:0;display:grid;place-items:center;">
    <span style="color:var(--text-3);font-size:14px">App — coming soon</span>
  </div>
</template>
```

- [ ] **Step 4: Commit**

```bash
git add src/router/index.ts src/App.vue src/app/AppLayout.vue
git commit -m "feat(onboarding): add router, App shell, AppLayout stub"
```

---

## Task 3: i18n locale files and main.ts

**Files:**
- Create: `src/locales/en.json`
- Create: `src/locales/ru.json`
- Modify: `src/main.ts`

- [ ] **Step 1: Create `src/locales/en.json`**

```json
{
  "onboarding": {
    "welcome": {
      "title": "Welcome to Nevo",
      "subtitle": "A quiet, local-first workspace for thinking, writing, and connecting ideas. Your notes stay on your device — always.",
      "createTitle": "Create a workspace",
      "createSub": "Start fresh — pick a folder, choose a template.",
      "openTitle": "Open existing",
      "openSub": "Point Nevo at any folder on disk.",
      "recent": "Recent",
      "pageCount": "{n} pages",
      "privacyBadge": "Local-first · nothing leaves this device"
    },
    "create": {
      "railHeadline": "A space for your thinking.",
      "railDesc": "Workspaces are plain folders on disk. You can copy them, sync them, and open them in any text editor.",
      "stepName": "Name & icon",
      "stepLocation": "Choose location",
      "stepTemplate": "Pick a template",
      "title": "Create your workspace",
      "desc": "Pick a name, a colour, and where to keep it.",
      "labelName": "Name",
      "hintName": "Shown in the sidebar and across the app",
      "labelIcon": "Icon & colour",
      "hintIcon": "Swap any time from workspace settings",
      "subGlyph": "GLYPH",
      "subColour": "COLOUR",
      "labelLocation": "Location",
      "hintLocation": "Where files live on your machine",
      "labelTemplate": "Template",
      "hintTemplate": "Optional — adds starter pages",
      "browse": "Browse…",
      "back": "Back",
      "createBtn": "Create workspace",
      "encryptNote": "Encrypted at rest with macOS Keychain"
    },
    "open": {
      "title": "Open a workspace",
      "desc": "Choose a folder on disk or select a recent workspace.",
      "browseBtn": "Browse folder…",
      "selectedPath": "Selected:",
      "openBtn": "Open",
      "recent": "Recent",
      "back": "Back"
    }
  }
}
```

- [ ] **Step 2: Create `src/locales/ru.json`**

```json
{
  "onboarding": {
    "welcome": {
      "title": "Добро пожаловать в Nevo",
      "subtitle": "Тихое, локальное рабочее пространство для мышления, письма и связи идей. Ваши заметки остаются на вашем устройстве — всегда.",
      "createTitle": "Создать хранилище",
      "createSub": "Начните с нуля — выберите папку и шаблон.",
      "openTitle": "Открыть существующее",
      "openSub": "Укажите Nevo на любую папку на диске.",
      "recent": "Недавние",
      "pageCount": "{n} страниц",
      "privacyBadge": "Локально · ничего не покидает устройство"
    },
    "create": {
      "railHeadline": "Пространство для вашего мышления.",
      "railDesc": "Хранилища — это обычные папки на диске. Их можно копировать, синхронизировать и открывать в любом редакторе.",
      "stepName": "Название и иконка",
      "stepLocation": "Выбор расположения",
      "stepTemplate": "Выбор шаблона",
      "title": "Создать хранилище",
      "desc": "Введите название, выберите цвет и место хранения.",
      "labelName": "Название",
      "hintName": "Отображается на боковой панели и по всему приложению",
      "labelIcon": "Иконка и цвет",
      "hintIcon": "Можно изменить в настройках хранилища",
      "subGlyph": "СИМВОЛ",
      "subColour": "ЦВЕТ",
      "labelLocation": "Расположение",
      "hintLocation": "Где хранятся файлы на вашем компьютере",
      "labelTemplate": "Шаблон",
      "hintTemplate": "Необязательно — добавляет стартовые страницы",
      "browse": "Выбрать…",
      "back": "Назад",
      "createBtn": "Создать хранилище",
      "encryptNote": "Зашифровано с macOS Keychain"
    },
    "open": {
      "title": "Открыть хранилище",
      "desc": "Выберите папку на диске или откройте недавнее хранилище.",
      "browseBtn": "Выбрать папку…",
      "selectedPath": "Выбрано:",
      "openBtn": "Открыть",
      "recent": "Недавние",
      "back": "Назад"
    }
  }
}
```

- [ ] **Step 3: Update `src/main.ts`** — import locale files and wire into i18n

```ts
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import App from './App.vue'
import { router } from './router'
import './styles/tokens.css'
import en from './locales/en.json'
import ru from './locales/ru.json'

const pinia = createPinia()

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  messages: { en, ru },
})

const app = createApp(App)
app.use(pinia)
app.use(router)
app.use(i18n)
app.mount('#app')

import { useThemeStore } from './stores/theme'
const themeStore = useThemeStore()
themeStore.init()
```

- [ ] **Step 4: Build check**

```bash
cd /home/malinka/projects/nevo_new/nevo && pnpm build
```

Expected: no TypeScript errors. Vite builds successfully.

- [ ] **Step 5: Commit**

```bash
git add src/locales/en.json src/locales/ru.json src/main.ts
git commit -m "feat(onboarding): add i18n locale files (en + ru) and wire into main.ts"
```

---

## Task 4: Tauri dialog plugin

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/capabilities/default.json`

- [ ] **Step 1: Install frontend package**

```bash
cd /home/malinka/projects/nevo_new/nevo && pnpm add @tauri-apps/plugin-dialog
```

Expected: `@tauri-apps/plugin-dialog` added to `dependencies` in `package.json`.

- [ ] **Step 2: Add Rust crate to `src-tauri/Cargo.toml`**

Add `tauri-plugin-dialog = "2"` under `[dependencies]`:

```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-opener = "2"
tauri-plugin-dialog = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

- [ ] **Step 3: Register plugin in `src-tauri/src/lib.rs`**

```rust
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application")
}
```

- [ ] **Step 4: Add capability to `src-tauri/capabilities/default.json`**

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capability for the main window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "opener:default",
    "dialog:allow-open"
  ]
}
```

- [ ] **Step 5: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/lib.rs src-tauri/capabilities/default.json package.json pnpm-lock.yaml
git commit -m "feat(onboarding): add tauri-plugin-dialog for native folder picker"
```

---

## Task 5: useWorkspacePicker composable

**Files:**
- Create: `src/features/onboarding/composables/useWorkspacePicker.ts`

- [ ] **Step 1: Create `src/features/onboarding/composables/useWorkspacePicker.ts`**

```ts
import { open } from '@tauri-apps/plugin-dialog'

export function useWorkspacePicker() {
  async function pickFolder(): Promise<string | null> {
    try {
      const result = await open({ directory: true, multiple: false })
      return typeof result === 'string' ? result : null
    } catch {
      return null
    }
  }

  return { pickFolder }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/onboarding/composables/useWorkspacePicker.ts
git commit -m "feat(onboarding): add useWorkspacePicker composable (Tauri dialog wrapper)"
```

---

## Task 6: WorkspaceIdentityPicker component

**Files:**
- Create: `src/features/onboarding/WorkspaceIdentityPicker.vue`

- [ ] **Step 1: Create `src/features/onboarding/WorkspaceIdentityPicker.vue`**

```vue
<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps<{
  name: string
  selectedGlyph: number
  selectedColor: number
  glyphs: readonly string[]
  colours: readonly string[]
}>()

const emit = defineEmits<{
  'update:name': [value: string]
  'update:selectedGlyph': [value: number]
  'update:selectedColor': [value: number]
}>()
</script>

<template>
  <div>
    <!-- Name -->
    <div class="form-group">
      <div class="form-label-row">
        <span class="form-label">{{ t('onboarding.create.labelName') }}</span>
        <span class="form-hint">{{ t('onboarding.create.hintName') }}</span>
      </div>
      <div class="name-input">
        <div class="name-icon" :style="{ background: colours[selectedColor] }">
          {{ glyphs[selectedGlyph] }}
        </div>
        <input
          :value="name"
          class="name-field"
          :placeholder="t('onboarding.create.labelName')"
          @input="emit('update:name', ($event.target as HTMLInputElement).value)"
        />
        <span class="nv-caret" />
      </div>
    </div>

    <!-- Icon & Colour -->
    <div class="form-group">
      <div class="form-label-row">
        <span class="form-label">{{ t('onboarding.create.labelIcon') }}</span>
        <span class="form-hint">{{ t('onboarding.create.hintIcon') }}</span>
      </div>
      <div class="icon-colour-row">
        <div>
          <div class="sub-label">{{ t('onboarding.create.subGlyph') }}</div>
          <div class="glyph-picker">
            <div
              v-for="(g, i) in glyphs"
              :key="i"
              class="glyph-item"
              :class="{ 'glyph-item--active': i === selectedGlyph }"
              @click="emit('update:selectedGlyph', i)"
            >{{ g }}</div>
          </div>
        </div>
        <div>
          <div class="sub-label">{{ t('onboarding.create.subColour') }}</div>
          <div class="colour-picker">
            <div
              v-for="(c, i) in colours"
              :key="i"
              class="colour-dot"
              :style="{
                background: c,
                boxShadow: i === selectedColor
                  ? '0 0 0 2px var(--canvas-1), 0 0 0 3.5px var(--accent)'
                  : 'inset 0 1px 0 oklch(1 0 0 / 0.25)',
              }"
              @click="emit('update:selectedColor', i)"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.form-group { margin-bottom: 22px; }
.form-label-row { display: flex; align-items: baseline; gap: 10px; margin-bottom: 8px; }
.form-label { font-size: 12.5px; font-weight: 550; color: var(--text-1); }
.form-hint { font-size: 11.5px; color: var(--text-4); }

.name-input {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px;
  background: var(--glass-3); border: 1.5px solid var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft); border-radius: 9px;
}
.name-icon {
  width: 24px; height: 24px; border-radius: 6px;
  font-family: var(--font-serif); font-style: italic;
  font-size: 14px; color: white;
  display: grid; place-items: center;
  box-shadow: inset 0 1px 0 oklch(1 0 0 / 0.25);
  flex: 0 0 auto;
}
.name-field {
  flex: 1; background: transparent; border: none; outline: none;
  font-size: 14.5px; color: var(--text-1); font-weight: 500; font-family: var(--font-ui);
}

.sub-label { font-size: 10.5px; color: var(--text-4); margin-bottom: 6px; letter-spacing: 0.05em; }
.icon-colour-row { display: flex; gap: 18px; }
.glyph-picker { display: flex; gap: 4px; }
.glyph-item {
  width: 28px; height: 28px; border-radius: 7px;
  display: grid; place-items: center;
  background: transparent; border: 1px solid var(--line-1);
  font-family: var(--font-serif); font-style: italic;
  font-size: 14px; color: var(--text-1); cursor: pointer;
}
.glyph-item--active { background: var(--hover-strong); border-color: var(--line-strong); }
.colour-picker { display: flex; gap: 6px; }
.colour-dot { width: 26px; height: 26px; border-radius: 999px; cursor: pointer; }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/features/onboarding/WorkspaceIdentityPicker.vue
git commit -m "feat(onboarding): add WorkspaceIdentityPicker component"
```

---

## Task 7: WorkspaceTemplatePicker component

**Files:**
- Create: `src/features/onboarding/WorkspaceTemplatePicker.vue`

- [ ] **Step 1: Create `src/features/onboarding/WorkspaceTemplatePicker.vue`**

```vue
<script setup lang="ts">
import { Check } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

interface Template {
  icon: string
  title: string
  sub: string
}

const props = defineProps<{
  templates: Template[]
  selectedTemplate: number
}>()

const emit = defineEmits<{
  'update:selectedTemplate': [value: number]
}>()
</script>

<template>
  <div class="form-group">
    <div class="form-label-row">
      <span class="form-label">{{ t('onboarding.create.labelTemplate') }}</span>
      <span class="form-hint">{{ t('onboarding.create.hintTemplate') }}</span>
    </div>
    <div class="template-grid">
      <div
        v-for="(tmpl, i) in templates"
        :key="i"
        class="template-card"
        :class="{ 'template-card--selected': i === selectedTemplate }"
        @click="emit('update:selectedTemplate', i)"
      >
        <div
          class="tmpl-icon"
          :style="{ color: i === selectedTemplate ? 'var(--accent)' : 'var(--text-2)' }"
        >{{ tmpl.icon }}</div>
        <div class="tmpl-name">{{ tmpl.title }}</div>
        <div class="tmpl-sub">{{ tmpl.sub }}</div>
        <div v-if="i === selectedTemplate" class="tmpl-check">
          <Check :size="9" stroke-width="3" style="color:white" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.form-group { margin-bottom: 22px; }
.form-label-row { display: flex; align-items: baseline; gap: 10px; margin-bottom: 8px; }
.form-label { font-size: 12.5px; font-weight: 550; color: var(--text-1); }
.form-hint { font-size: 11.5px; color: var(--text-4); }

.template-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.template-card {
  padding: 12px 12px 10px; border-radius: 9px;
  background: var(--glass-3); border: 1px solid var(--line-2);
  cursor: pointer; position: relative;
  transition: background .12s;
}
.template-card--selected {
  background: var(--accent-soft);
  border-color: oklch(0.66 0.10 258 / 0.4);
}
.tmpl-icon { font-family: var(--font-serif); font-size: 22px; line-height: 1; margin-bottom: 8px; }
.tmpl-name { font-size: 12.5px; font-weight: 550; color: var(--text-1); }
.tmpl-sub { font-size: 11px; color: var(--text-4); margin-top: 1px; }
.tmpl-check {
  position: absolute; top: 8px; right: 8px;
  width: 14px; height: 14px; border-radius: 999px;
  background: var(--accent); display: grid; place-items: center;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/features/onboarding/WorkspaceTemplatePicker.vue
git commit -m "feat(onboarding): add WorkspaceTemplatePicker component"
```

---

## Task 8: WelcomeHero screen

**Files:**
- Create: `src/features/onboarding/WelcomeHero.vue`

- [ ] **Step 1: Create `src/features/onboarding/WelcomeHero.vue`**

```vue
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Plus, Folder, ChevronRight, Pin } from 'lucide-vue-next'
import { useWorkspaceStore } from '../../stores/workspace'
import { useRouter } from 'vue-router'

const { t } = useI18n()
const workspace = useWorkspaceStore()
const router = useRouter()

const emit = defineEmits<{ create: []; open: [] }>()

function openWorkspace(ws: typeof workspace.recentWorkspaces[0]) {
  workspace.openWorkspace(ws)
  router.push('/app')
}
</script>

<template>
  <div class="welcome-hero">
    <div class="blob blob-1" />
    <div class="blob blob-2" />
    <div class="blob blob-3" />

    <div class="hero-inner">
      <div class="nevo-mark">N</div>

      <div class="hero-text">
        <div class="hero-title">{{ t('onboarding.welcome.title') }}</div>
        <div class="hero-sub">{{ t('onboarding.welcome.subtitle') }}</div>
      </div>

      <div class="action-grid">
        <button class="action-card action-card--accent" @click="emit('create')">
          <div class="ac-header">
            <div class="ac-icon ac-icon--accent"><Plus :size="18" /></div>
            <kbd class="nv-kbd">⏎</kbd>
          </div>
          <div class="ac-body">
            <div class="ac-title">{{ t('onboarding.welcome.createTitle') }}</div>
            <div class="ac-sub">{{ t('onboarding.welcome.createSub') }}</div>
          </div>
        </button>
        <button class="action-card" @click="emit('open')">
          <div class="ac-header">
            <div class="ac-icon"><Folder :size="18" /></div>
            <kbd class="nv-kbd">⌘O</kbd>
          </div>
          <div class="ac-body">
            <div class="ac-title">{{ t('onboarding.welcome.openTitle') }}</div>
            <div class="ac-sub">{{ t('onboarding.welcome.openSub') }}</div>
          </div>
        </button>
      </div>

      <div class="recents">
        <div class="recents-label">{{ t('onboarding.welcome.recent') }}</div>
        <div class="recents-list">
          <div
            v-for="(ws, i) in workspace.recentWorkspaces"
            :key="ws.id"
            class="recent-row"
            :class="{ 'recent-row--highlight': i === 0 }"
            @click="openWorkspace(ws)"
          >
            <div class="ws-icon" :style="{ background: ws.color }">{{ ws.icon }}</div>
            <div class="ws-info">
              <div class="ws-name-row">
                <span class="ws-title">{{ ws.name }}</span>
                <Pin v-if="ws.pinned" :size="10" style="color:var(--text-4)" />
              </div>
              <div class="ws-path">{{ ws.path }}</div>
            </div>
            <div class="ws-meta-right">
              <div class="ws-date">{{ ws.lastOpened }}</div>
              <div class="ws-pages">{{ t('onboarding.welcome.pageCount', { n: ws.pageCount.toLocaleString() }) }}</div>
            </div>
            <ChevronRight :size="12" style="color:var(--text-4)" />
          </div>
        </div>
      </div>
    </div>

    <div class="privacy-badge">
      <span class="green-dot" /> {{ t('onboarding.welcome.privacyBadge') }}
    </div>
    <div class="version-badge">v0.1.0 · Tauri</div>
  </div>
</template>

<style scoped>
.welcome-hero {
  flex: 1; position: relative; overflow: hidden;
  display: grid; place-items: center; padding: 40px 60px;
}

.blob { position: absolute; border-radius: 50%; filter: blur(40px); pointer-events: none; }
.blob-1 { top: -15%; left: 12%; width: 460px; height: 460px; background: radial-gradient(circle, oklch(0.66 0.10 258 / 0.45), transparent 60%); }
.blob-2 { bottom: -20%; right: 8%; width: 540px; height: 540px; background: radial-gradient(circle, oklch(0.72 0.08 30 / 0.35), transparent 60%); filter: blur(50px); }
.blob-3 { top: 40%; left: 55%; width: 320px; height: 320px; background: radial-gradient(circle, oklch(0.7 0.08 155 / 0.20), transparent 60%); }

.hero-inner {
  position: relative; z-index: 1;
  max-width: 620px; width: 100%;
  display: flex; flex-direction: column; align-items: center; gap: 28px;
}

.nevo-mark {
  width: 56px; height: 56px; border-radius: 16px;
  background: linear-gradient(135deg, var(--accent) 0%, oklch(0.55 0.10 290) 100%);
  display: grid; place-items: center;
  font-family: var(--font-serif); font-style: italic;
  font-size: 34px; font-weight: 400; color: white;
  letter-spacing: -0.04em;
  box-shadow: inset 0 1px 0 oklch(1 0 0 / 0.35), 0 16px 40px var(--accent-glow);
}

.hero-text { text-align: center; }
.hero-title {
  font-family: var(--font-serif); font-size: 52px; line-height: 1.05;
  letter-spacing: -0.02em; color: var(--text-1); font-weight: 400;
}
.hero-sub {
  font-size: 16px; line-height: 1.55; color: var(--text-3);
  margin-top: 14px; max-width: 460px;
}

.action-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; width: 100%; margin-top: 12px; }
.action-card {
  display: flex; flex-direction: column; align-items: flex-start; gap: 10px;
  padding: 18px 18px 16px;
  background: var(--glass-3); backdrop-filter: blur(28px) saturate(160%);
  border: 1px solid var(--line-2); border-radius: 12px;
  cursor: pointer; text-align: left;
  box-shadow: var(--shadow-1); color: var(--text-1); font-family: inherit;
  transition: background .15s, border-color .15s, box-shadow .15s;
}
.action-card:hover { background: var(--hover-strong); }
.action-card--accent {
  background: oklch(0.66 0.10 258 / 0.12);
  border-color: oklch(0.66 0.10 258 / 0.35);
  box-shadow: 0 12px 30px -10px var(--accent-glow), inset 0 1px 0 oklch(1 0 0 / 0.08);
}

.ac-header { display: flex; align-items: center; gap: 10px; width: 100%; }
.ac-icon {
  width: 34px; height: 34px; border-radius: 9px;
  background: var(--hover-strong); color: var(--text-2);
  display: grid; place-items: center;
}
.ac-icon--accent { background: var(--accent); color: white; box-shadow: inset 0 1px 0 oklch(1 0 0 / 0.3), 0 4px 10px var(--accent-glow); }

.ac-body { text-align: left; }
.ac-title { font-size: 15.5px; font-weight: 550; color: var(--text-1); letter-spacing: -0.01em; }
.ac-sub { font-size: 12.5px; color: var(--text-3); margin-top: 4px; line-height: 1.4; }

.recents { width: 100%; margin-top: 6px; }
.recents-label { font-size: 10.5px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-4); margin-bottom: 10px; padding-left: 4px; }
.recents-list { display: flex; flex-direction: column; gap: 4px; }

.recent-row {
  display: flex; align-items: center; gap: 12px;
  padding: 8px 12px; border-radius: 10px;
  background: transparent; border: 1px solid transparent;
  cursor: pointer; transition: background .12s;
}
.recent-row:hover { background: var(--hover); }
.recent-row--highlight { background: var(--hover-strong); border-color: var(--line-2); }

.ws-icon {
  width: 28px; height: 28px; border-radius: 7px;
  font-size: 13px; font-weight: 600; color: white;
  display: grid; place-items: center;
  box-shadow: inset 0 1px 0 oklch(1 0 0 / 0.25);
  font-family: var(--font-serif); font-style: italic; flex: 0 0 auto;
}
.ws-info { flex: 1; min-width: 0; }
.ws-name-row { display: flex; align-items: center; gap: 6px; }
.ws-title { font-size: 13.5px; font-weight: 500; color: var(--text-1); }
.ws-path { font-size: 11.5px; color: var(--text-4); font-family: var(--font-mono); margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ws-meta-right { text-align: right; }
.ws-date { font-size: 11.5px; color: var(--text-3); }
.ws-pages { font-size: 10.5px; color: var(--text-4); font-family: var(--font-mono); margin-top: 1px; }

.privacy-badge {
  position: absolute; left: 18px; bottom: 14px; z-index: 2;
  display: flex; align-items: center; gap: 8px;
  padding: 6px 10px 6px 8px; border-radius: 999px;
  background: var(--glass-3); backdrop-filter: blur(20px) saturate(150%);
  border: 1px solid var(--line-2); font-size: 11px; color: var(--text-3);
}
.green-dot { width: 6px; height: 6px; border-radius: 999px; background: oklch(0.7 0.12 145); box-shadow: 0 0 8px oklch(0.7 0.12 145 / 0.7); }
.version-badge { position: absolute; right: 18px; bottom: 14px; z-index: 2; font-size: 11px; color: var(--text-4); font-family: var(--font-mono); }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/features/onboarding/WelcomeHero.vue
git commit -m "feat(onboarding): add WelcomeHero screen with i18n"
```

---

## Task 9: CreateWorkspace screen (refactored)

**Files:**
- Create: `src/features/onboarding/CreateWorkspace.vue`

- [ ] **Step 1: Create `src/features/onboarding/CreateWorkspace.vue`**

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check, ArrowRight, ArrowLeft, Folder } from 'lucide-vue-next'
import { useWorkspaceStore } from '../../stores/workspace'
import { useRouter } from 'vue-router'
import { useWorkspacePicker } from './composables/useWorkspacePicker'
import WorkspaceIdentityPicker from './WorkspaceIdentityPicker.vue'
import WorkspaceTemplatePicker from './WorkspaceTemplatePicker.vue'

const { t } = useI18n()
const workspace = useWorkspaceStore()
const router = useRouter()
const { pickFolder } = useWorkspacePicker()

const emit = defineEmits<{ back: [] }>()

const name = ref('Atelier')
const selectedColor = ref(0)
const selectedGlyph = ref(0)
const selectedTemplate = ref(0)
const customPath = ref<string | null>(null)

const colours = [
  'linear-gradient(135deg, oklch(0.66 0.10 258), oklch(0.55 0.10 290))',
  'linear-gradient(135deg, oklch(0.72 0.08 30),  oklch(0.65 0.10 350))',
  'linear-gradient(135deg, oklch(0.7 0.10 145),  oklch(0.6 0.08 200))',
  'linear-gradient(135deg, oklch(0.78 0.10 78),  oklch(0.68 0.10 40))',
  'linear-gradient(135deg, oklch(0.65 0.05 280), oklch(0.55 0.06 240))',
  'linear-gradient(135deg, oklch(0.72 0.06 210), oklch(0.6 0.07 250))',
] as const

const glyphs = ['N', '◐', '✦', '◇', '◑', '⌘'] as const

const templates = [
  { icon: '◯', title: 'Empty',      sub: 'Just a daily page' },
  { icon: '✦', title: 'Researcher', sub: 'Lit notes + sources' },
  { icon: '◐', title: 'PM',         sub: 'Roadmap, OKRs' },
  { icon: '◇', title: 'Writer',     sub: 'Drafts, journal' },
]

const displayPath = computed(() =>
  customPath.value ?? `~/Documents/Nevo/${name.value}`
)

const steps = computed(() => [
  { label: t('onboarding.create.stepName'),     done: true },
  { label: t('onboarding.create.stepLocation'), done: true },
  { label: t('onboarding.create.stepTemplate'), done: false },
])

async function browse() {
  const path = await pickFolder()
  if (path) customPath.value = path
}

function create() {
  workspace.createWorkspace(name.value, displayPath.value)
  router.push('/app')
}
</script>

<template>
  <div class="create-ws">
    <div class="blob blob-1" />
    <div class="blob blob-2" />

    <!-- Left rail -->
    <div class="left-rail">
      <div class="nevo-mark-sm">N</div>
      <div class="rail-headline"><em>{{ t('onboarding.create.railHeadline') }}</em></div>
      <p class="rail-desc">{{ t('onboarding.create.railDesc') }}</p>
      <div style="flex:1" />
      <div class="steps">
        <div v-for="(step, i) in steps" :key="i" class="step">
          <span class="step-num" :class="{ 'step-num--done': step.done }">
            <Check v-if="step.done" :size="10" stroke-width="2.8" />
            <span v-else>{{ i + 1 }}</span>
          </span>
          <span :style="{ color: step.done ? 'var(--text-1)' : 'var(--text-2)' }">{{ step.label }}</span>
        </div>
      </div>
    </div>

    <!-- Right form -->
    <div class="right-form">
      <div class="form-inner">
        <div class="step-label">{{ t('onboarding.create.stepTemplate') }}</div>
        <h1 class="form-title">{{ t('onboarding.create.title') }}</h1>
        <p class="form-desc">{{ t('onboarding.create.desc') }}</p>

        <WorkspaceIdentityPicker
          v-model:name="name"
          v-model:selected-glyph="selectedGlyph"
          v-model:selected-color="selectedColor"
          :glyphs="glyphs"
          :colours="colours"
        />

        <!-- Location -->
        <div class="form-group">
          <div class="form-label-row">
            <span class="form-label">{{ t('onboarding.create.labelLocation') }}</span>
            <span class="form-hint">{{ t('onboarding.create.hintLocation') }}</span>
          </div>
          <div class="location-row">
            <Folder :size="14" style="color:var(--text-3);flex:0 0 auto" />
            <span class="location-path nv-mono">{{ displayPath }}</span>
            <div style="flex:1" />
            <button class="nv-btn nv-btn--ghost" style="height:24px;font-size:11.5px" @click="browse">
              {{ t('onboarding.create.browse') }}
            </button>
          </div>
        </div>

        <WorkspaceTemplatePicker
          v-model:selected-template="selectedTemplate"
          :templates="templates"
        />

        <!-- Footer -->
        <div class="form-footer">
          <button class="nv-btn" style="height:32px;padding:0 14px;font-size:13px" @click="emit('back')">
            <ArrowLeft :size="12" /> {{ t('onboarding.create.back') }}
          </button>
          <div style="flex:1" />
          <span class="encrypt-note">{{ t('onboarding.create.encryptNote') }}</span>
          <button class="nv-btn nv-btn--primary" style="height:32px;padding:0 16px;font-size:13px" @click="create">
            {{ t('onboarding.create.createBtn') }} <ArrowRight :size="12" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.create-ws { flex: 1; display: flex; position: relative; overflow: hidden; }
.blob { position: absolute; border-radius: 50%; filter: blur(40px); pointer-events: none; }
.blob-1 { top: -15%; left: 12%; width: 460px; height: 460px; background: radial-gradient(circle, oklch(0.66 0.10 258 / 0.45), transparent 60%); }
.blob-2 { bottom: -20%; right: 8%; width: 540px; height: 540px; background: radial-gradient(circle, oklch(0.72 0.08 30 / 0.35), transparent 60%); filter: blur(50px); }

.left-rail {
  width: 280px; flex: 0 0 280px; position: relative; z-index: 1;
  padding: 48px 32px 32px;
  display: flex; flex-direction: column; gap: 18px;
  background: var(--glass-1); backdrop-filter: blur(24px) saturate(140%);
  border-right: 1px solid var(--line-1);
}
.nevo-mark-sm {
  width: 36px; height: 36px; border-radius: 10px;
  background: linear-gradient(135deg, var(--accent), oklch(0.55 0.10 290));
  display: grid; place-items: center;
  font-family: var(--font-serif); font-style: italic;
  font-size: 22px; color: white;
}
.rail-headline { font-family: var(--font-serif); font-size: 28px; line-height: 1.1; letter-spacing: -0.018em; color: var(--text-1); }
.rail-headline em { font-style: italic; }
.rail-desc { font-size: 13px; color: var(--text-3); line-height: 1.55; }
.steps { display: flex; flex-direction: column; gap: 10px; font-size: 12px; color: var(--text-3); }
.step { display: flex; align-items: center; gap: 10px; }
.step-num { width: 18px; height: 18px; border-radius: 999px; background: var(--hover-strong); color: var(--text-3); display: grid; place-items: center; font-size: 10px; font-weight: 600; flex: 0 0 auto; }
.step-num--done { background: var(--accent); color: white; box-shadow: 0 0 0 3px var(--accent-soft); }

.right-form { flex: 1; position: relative; z-index: 1; padding: 40px 56px; overflow-y: auto; }
.form-inner { max-width: 540px; }
.step-label { font-size: 10.5px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent); }
.form-title { font-family: var(--font-serif); font-weight: 400; font-size: 36px; line-height: 1.1; letter-spacing: -0.018em; color: var(--text-1); margin: 6px 0 4px; }
.form-desc { font-size: 14px; color: var(--text-3); line-height: 1.55; margin: 6px 0 28px; max-width: 460px; }

.form-group { margin-bottom: 22px; }
.form-label-row { display: flex; align-items: baseline; gap: 10px; margin-bottom: 8px; }
.form-label { font-size: 12.5px; font-weight: 550; color: var(--text-1); }
.form-hint { font-size: 11.5px; color: var(--text-4); }

.location-row { display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: var(--hover); border: 1px solid var(--line-2); border-radius: 9px; }
.location-path { font-size: 13px; color: var(--text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.form-footer { display: flex; align-items: center; gap: 8px; margin-top: 26px; }
.encrypt-note { font-size: 11.5px; color: var(--text-4); margin-right: 6px; }
</style>
```

- [ ] **Step 2: Build check**

```bash
cd /home/malinka/projects/nevo_new/nevo && pnpm build
```

Expected: TypeScript and Vite both pass with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/onboarding/CreateWorkspace.vue
git commit -m "feat(onboarding): add CreateWorkspace screen with i18n and Tauri folder picker"
```

---

## Task 10: OpenWorkspace screen + OnboardingView orchestrator

**Files:**
- Create: `src/features/onboarding/OpenWorkspace.vue`
- Create: `src/features/onboarding/OnboardingView.vue`

- [ ] **Step 1: Create `src/features/onboarding/OpenWorkspace.vue`**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Folder, ArrowLeft, ChevronRight, Pin } from 'lucide-vue-next'
import { useWorkspaceStore } from '../../stores/workspace'
import type { Workspace } from '../../stores/workspace'
import { useRouter } from 'vue-router'
import { useWorkspacePicker } from './composables/useWorkspacePicker'

const { t } = useI18n()
const workspace = useWorkspaceStore()
const router = useRouter()
const { pickFolder } = useWorkspacePicker()

const emit = defineEmits<{ back: [] }>()

const selectedPath = ref<string | null>(null)

async function browse() {
  const path = await pickFolder()
  if (path) selectedPath.value = path
}

function openFromPath() {
  if (!selectedPath.value) return
  const ws: Workspace = {
    id: Date.now().toString(),
    name: selectedPath.value.split('/').pop() ?? 'Workspace',
    path: selectedPath.value,
    icon: 'N',
    color: 'linear-gradient(135deg, oklch(0.66 0.10 258), oklch(0.55 0.10 290))',
    pageCount: 0,
    lastOpened: 'just now',
  }
  workspace.openWorkspace(ws)
  router.push('/app')
}

function openRecent(ws: Workspace) {
  workspace.openWorkspace(ws)
  router.push('/app')
}
</script>

<template>
  <div class="open-ws">
    <div class="blob blob-1" />
    <div class="blob blob-2" />

    <div class="open-inner">
      <div class="nevo-mark">N</div>

      <div class="open-header">
        <div class="open-title">{{ t('onboarding.open.title') }}</div>
        <div class="open-desc">{{ t('onboarding.open.desc') }}</div>
      </div>

      <div class="browse-card">
        <button class="browse-trigger nv-btn nv-btn--ghost" @click="browse">
          <Folder :size="15" />
          {{ t('onboarding.open.browseBtn') }}
        </button>
        <div v-if="selectedPath" class="selected-row">
          <span class="selected-label">{{ t('onboarding.open.selectedPath') }}</span>
          <span class="selected-path nv-mono">{{ selectedPath }}</span>
          <div style="flex:1" />
          <button class="nv-btn nv-btn--primary" style="height:28px;padding:0 14px;font-size:12.5px" @click="openFromPath">
            {{ t('onboarding.open.openBtn') }}
          </button>
        </div>
      </div>

      <div class="recents">
        <div class="recents-label">{{ t('onboarding.open.recent') }}</div>
        <div class="recents-list">
          <div
            v-for="(ws, i) in workspace.recentWorkspaces"
            :key="ws.id"
            class="recent-row"
            :class="{ 'recent-row--highlight': i === 0 }"
            @click="openRecent(ws)"
          >
            <div class="ws-icon" :style="{ background: ws.color }">{{ ws.icon }}</div>
            <div class="ws-info">
              <div class="ws-name-row">
                <span class="ws-title">{{ ws.name }}</span>
                <Pin v-if="ws.pinned" :size="10" style="color:var(--text-4)" />
              </div>
              <div class="ws-path nv-mono">{{ ws.path }}</div>
            </div>
            <div class="ws-date">{{ ws.lastOpened }}</div>
            <ChevronRight :size="12" style="color:var(--text-4)" />
          </div>
        </div>
      </div>

      <button class="nv-btn back-btn" @click="emit('back')">
        <ArrowLeft :size="12" /> {{ t('onboarding.open.back') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.open-ws {
  flex: 1; position: relative; overflow: hidden;
  display: grid; place-items: center; padding: 40px 60px;
}

.blob { position: absolute; border-radius: 50%; filter: blur(40px); pointer-events: none; }
.blob-1 { top: -15%; left: 12%; width: 460px; height: 460px; background: radial-gradient(circle, oklch(0.66 0.10 258 / 0.35), transparent 60%); }
.blob-2 { bottom: -20%; right: 8%; width: 540px; height: 540px; background: radial-gradient(circle, oklch(0.72 0.08 30 / 0.25), transparent 60%); filter: blur(50px); }

.open-inner {
  position: relative; z-index: 1;
  max-width: 560px; width: 100%;
  display: flex; flex-direction: column; align-items: center; gap: 24px;
}

.nevo-mark {
  width: 44px; height: 44px; border-radius: 13px;
  background: linear-gradient(135deg, var(--accent) 0%, oklch(0.55 0.10 290) 100%);
  display: grid; place-items: center;
  font-family: var(--font-serif); font-style: italic;
  font-size: 27px; font-weight: 400; color: white;
  box-shadow: inset 0 1px 0 oklch(1 0 0 / 0.35), 0 12px 30px var(--accent-glow);
}

.open-header { text-align: center; }
.open-title { font-family: var(--font-serif); font-size: 38px; line-height: 1.1; letter-spacing: -0.02em; color: var(--text-1); }
.open-desc { font-size: 14px; line-height: 1.55; color: var(--text-3); margin-top: 10px; }

.browse-card {
  width: 100%;
  background: var(--glass-3); backdrop-filter: blur(28px) saturate(160%);
  border: 1px solid var(--line-2); border-radius: 12px;
  padding: 16px; display: flex; flex-direction: column; gap: 12px;
  box-shadow: var(--shadow-1);
}
.browse-trigger { height: 36px; padding: 0 16px; font-size: 13px; width: 100%; justify-content: center; }
.selected-row { display: flex; align-items: center; gap: 10px; }
.selected-label { font-size: 11.5px; color: var(--text-4); white-space: nowrap; }
.selected-path { font-size: 12px; color: var(--text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.recents { width: 100%; }
.recents-label { font-size: 10.5px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-4); margin-bottom: 10px; padding-left: 4px; }
.recents-list { display: flex; flex-direction: column; gap: 4px; }

.recent-row {
  display: flex; align-items: center; gap: 12px;
  padding: 8px 12px; border-radius: 10px;
  background: transparent; border: 1px solid transparent;
  cursor: pointer; transition: background .12s;
}
.recent-row:hover { background: var(--hover); }
.recent-row--highlight { background: var(--hover-strong); border-color: var(--line-2); }

.ws-icon {
  width: 28px; height: 28px; border-radius: 7px;
  font-size: 13px; color: white;
  display: grid; place-items: center;
  box-shadow: inset 0 1px 0 oklch(1 0 0 / 0.25);
  font-family: var(--font-serif); font-style: italic; flex: 0 0 auto;
}
.ws-info { flex: 1; min-width: 0; }
.ws-name-row { display: flex; align-items: center; gap: 6px; }
.ws-title { font-size: 13.5px; font-weight: 500; color: var(--text-1); }
.ws-path { font-size: 11.5px; color: var(--text-4); margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ws-date { font-size: 11.5px; color: var(--text-3); white-space: nowrap; }

.back-btn { align-self: flex-start; color: var(--text-3); }
</style>
```

- [ ] **Step 2: Create `src/features/onboarding/OnboardingView.vue`**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import WelcomeHero from './WelcomeHero.vue'
import CreateWorkspace from './CreateWorkspace.vue'
import OpenWorkspace from './OpenWorkspace.vue'

type Screen = 'welcome' | 'create' | 'open'
const screen = ref<Screen>('welcome')
</script>

<template>
  <div class="onboarding">
    <div class="onboard-titlebar">
      <div class="traffic-lights">
        <div v-for="c in ['#ff5f57', '#febc2e', '#28c840']" :key="c" class="traffic-dot" :style="{ background: c }" />
      </div>
      <div style="flex:1" />
      <div class="titlebar-label">Nevo</div>
      <div style="flex:1" />
      <div style="width:52px" />
    </div>

    <Transition name="screen" mode="out-in">
      <WelcomeHero
        v-if="screen === 'welcome'"
        key="welcome"
        @create="screen = 'create'"
        @open="screen = 'open'"
      />
      <CreateWorkspace
        v-else-if="screen === 'create'"
        key="create"
        @back="screen = 'welcome'"
      />
      <OpenWorkspace
        v-else
        key="open"
        @back="screen = 'welcome'"
      />
    </Transition>
  </div>
</template>

<style scoped>
.onboarding {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; z-index: 10;
}

.onboard-titlebar {
  height: 36px; flex: 0 0 36px;
  display: flex; align-items: center; gap: 10px; padding: 0 12px;
  background: var(--glass-titlebar);
  backdrop-filter: blur(24px) saturate(160%);
  border-bottom: 1px solid var(--line-1);
  position: relative; z-index: 5;
  -webkit-app-region: drag;
  user-select: none;
}

.traffic-lights { display: flex; gap: 8px; align-items: center; }
.traffic-dot { width: 12px; height: 12px; border-radius: 999px; box-shadow: inset 0 0 0 0.5px rgba(0,0,0,0.15); }
.titlebar-label { font-size: 11.5px; color: var(--text-3); letter-spacing: 0.02em; }

.screen-enter-active,
.screen-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.screen-enter-from { opacity: 0; transform: scale(0.98); }
.screen-leave-to { opacity: 0; transform: scale(0.98); }
</style>
```

- [ ] **Step 3: Final build check**

```bash
cd /home/malinka/projects/nevo_new/nevo && pnpm build
```

Expected: zero TypeScript errors, Vite build succeeds.

- [ ] **Step 4: Visual check** — launch `pnpm tauri dev` and verify:
  - Welcome screen shows with correct i18n strings
  - "Create a workspace" card navigates to CreateWorkspace
  - "Open existing" card navigates to OpenWorkspace
  - Recent workspaces list renders and clicking one navigates to `/app`
  - CreateWorkspace: name input, glyph/color pickers, location row (Browse… opens native dialog), template grid, Back/Create buttons all work
  - OpenWorkspace: Browse folder… opens native dialog, recent list works, Back button works
  - Transition animations play (fade + scale)

- [ ] **Step 5: Commit**

```bash
git add src/features/onboarding/OpenWorkspace.vue src/features/onboarding/OnboardingView.vue
git commit -m "feat(onboarding): add OpenWorkspace screen and OnboardingView orchestrator — completes onboarding flow"
```
