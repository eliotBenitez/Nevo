# Onboarding — Design Spec
Date: 2026-05-13

## Scope

Implement the onboarding/welcome flow for Nevo. The flow handles first-run and workspace selection before the user enters the main app.

## User Flow

```
App launch
  └── OnboardingView
        ├── WelcomeHero  (default)
        │     ├── [Create workspace] → CreateWorkspace
        │     └── [Open existing]   → OpenWorkspace
        ├── CreateWorkspace
        │     ├── name + icon + color (WorkspaceIdentityPicker)
        │     ├── location (Tauri folder picker via useWorkspacePicker)
        │     ├── template (WorkspaceTemplatePicker)
        │     └── [Create] → router.push('/app')
        └── OpenWorkspace
              ├── [Browse folder…] → Tauri folder picker → confirm path → [Open]
              ├── Recent workspaces list
              └── click recent → router.push('/app')
```

## Architecture

### i18n

- `src/locales/en.json` — English strings (base locale)
- `src/locales/ru.json` — Russian strings
- `src/plugins/i18n.ts` — creates and exports `createI18n` instance
- `src/main.ts` — registers i18n plugin
- Key namespace: `onboarding.*` (welcome.*, create.*, open.*)
- No hardcoded user-facing strings in any component

### Tauri integration

- `features/onboarding/composables/useWorkspacePicker.ts`
  - Wraps `@tauri-apps/plugin-dialog` `open()` with `{ directory: true }`
  - Returns `{ pickFolder: () => Promise<string | null> }`
  - Keeps UI components free of Tauri imports

### Files changed

**New:**
| File | Purpose |
|---|---|
| `src/locales/en.json` | English translations |
| `src/locales/ru.json` | Russian translations |
| `src/plugins/i18n.ts` | vue-i18n instance |
| `features/onboarding/composables/useWorkspacePicker.ts` | Tauri folder picker |
| `features/onboarding/OpenWorkspace.vue` | Open existing workspace screen |
| `features/onboarding/WorkspaceIdentityPicker.vue` | Name + glyph + color picker |
| `features/onboarding/WorkspaceTemplatePicker.vue` | Template grid |

**Modified:**
| File | Change |
|---|---|
| `src/main.ts` | Register i18n plugin |
| `features/router/index.ts` | Fix import paths (`../features/` → `../`) |
| `features/onboarding/OnboardingView.vue` | Add OpenWorkspace screen case |
| `features/onboarding/WelcomeHero.vue` | Replace hardcoded strings with `t()` |
| `features/onboarding/CreateWorkspace.vue` | Split into subcomponents, add i18n + Tauri |

### Component split: CreateWorkspace

| Component | Responsibility | Lines (est.) |
|---|---|---|
| `CreateWorkspace.vue` | State, left rail (steps), footer, Tauri + router | ~120 |
| `WorkspaceIdentityPicker.vue` | Name input, glyph picker, color picker | ~90 |
| `WorkspaceTemplatePicker.vue` | Template grid with selection | ~70 |

Props/emits pattern: parent holds `name`, `selectedColor`, `selectedGlyph`, `selectedTemplate` as refs, passes as props to pickers, receives updates via `update:*` emits.

### OpenWorkspace design

Two zones:
1. **Browse zone** — button triggers `pickFolder()`, shows selected path preview, [Open] button
2. **Recents zone** — same workspace list as WelcomeHero, click to open immediately

Visual style: matches WelcomeHero (glass card, ambient blobs, no left rail needed).

## Locale key structure

```json
{
  "onboarding": {
    "welcome": {
      "title": "Welcome to Nevo",
      "subtitle": "A quiet, local-first workspace...",
      "createTitle": "Create a workspace",
      "createSub": "Start fresh — pick a folder, choose a template.",
      "openTitle": "Open existing",
      "openSub": "Point Nevo at any folder on disk.",
      "recent": "Recent",
      "pageCount": "{n} pages",
      "privacyBadge": "Local-first · nothing leaves this device"
    },
    "create": {
      "stepLabel": "Step {n} of {total}",
      "railHeadline": "A space for your thinking.",
      "railDesc": "Workspaces are plain folders on disk...",
      "title": "Create your workspace",
      "desc": "Pick a name, a colour, and where to keep it.",
      "labelName": "Name",
      "hintName": "Shown in the sidebar and across the app",
      "labelIcon": "Icon & colour",
      "hintIcon": "Swap any time from workspace settings",
      "labelLocation": "Location",
      "hintLocation": "Where files live on your machine",
      "labelTemplate": "Template",
      "hintTemplate": "Optional — adds starter pages",
      "browse": "Browse…",
      "back": "Back",
      "createBtn": "Create workspace",
      "encryptNote": "Encrypted at rest with macOS Keychain",
      "steps": {
        "name": "Name & icon",
        "location": "Choose location",
        "template": "Pick a template"
      }
    },
    "open": {
      "title": "Open a workspace",
      "desc": "Choose a folder or pick a recent workspace.",
      "browseBtn": "Browse folder…",
      "openBtn": "Open",
      "recent": "Recent",
      "or": "or"
    }
  }
}
```

## Constraints

- Max 300 lines per file (CLAUDE.md)
- No Options API — Composition API only
- ProseMirror state stays isolated (not affected by this feature)
- Tauri imports only in composables, not in Vue components directly
- No hardcoded user-facing strings
