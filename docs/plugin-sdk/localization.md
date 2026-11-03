# Localization

Available since SDK 2.2.0. A plugin ships its own translations as JSON
catalogs. The host reads them to localize the plugin's name, description and
settings, and hands the same catalog to your code as `api.i18n`.

## Layout

```text
<plugin>/
├── manifest.json            optional "defaultLocale": "en"
├── locales/
│   ├── en.json
│   ├── ru.json
│   └── pt-BR.json
├── README.md                fallback README
├── README.en.md
└── README.ru.md
```

Catalogs are flat: every key maps to a string, and `{name}` marks a
placeholder.

```json
{
  "manifest.name": "Привет",
  "manifest.description": "Добавляет команду приветствия.",
  "slash.hello": "Вставить приветствие для {name}",
  "settings.greeting.label": "Приветствие"
}
```

`defaultLocale` in `manifest.json` names the catalog used to fill gaps. When it
is absent, `en` is used.

## Resolution

For the app locale `L` the host reads, in order:

1. `locales/<L>.json`;
2. the base language, for example `pt` for `pt-BR`;
3. `locales/<defaultLocale>.json`.

The catalogs are merged, so a key missing in `ru.json` comes from the default
catalog. A key missing everywhere returns the key itself. README files use the
same chain (`README.<L>.md`, base language, `README.<defaultLocale>.md`) and
end at `README.md`. File names are matched without regard to letter case.

The registered app locales are `en`, `ru`, `fr`, `es` and `de`; ship at least
the `defaultLocale` catalog.

## Limits

| Item | Limit |
| --- | --- |
| Catalog file | 128 KiB |
| Keys per catalog | 2000 |
| Key format | `^[A-Za-z0-9_.-]{1,128}$` |
| Value | 4 KiB |

Values must be strings. A catalog in the chain that breaks a limit, is not a
flat JSON object of strings, or is not valid UTF-8 is rejected together with
the rest of the chain: the error is logged and the plugin shows its manifest
text and raw keys until the file is fixed. A missing catalog file is not an
error; the next locale in the chain is used.

## Compatibility

`api.i18n` exists on hosts with SDK 2.2.0 or newer. Hosts only compare the
major `apiVersion`, so a plugin that must also run on an older 2.x host should
guard the call (`api.i18n?.t(key) ?? fallback`). Manifests without `locales/`
or `defaultLocale` behave exactly as before.

## Using `api.i18n` in `setup`

```ts
import { definePlugin } from '@nevo/plugin-sdk'

export default definePlugin({
  setup(api) {
    api.slashItem({
      id: `${api.pluginId}.hello`,
      title: api.i18n.t('slash.hello', { name: 'Nevo' }),
      category: 'text',
    }, () => null)
  },
})
```

- `api.i18n.locale` is the resolved app locale.
- `api.i18n.t(key, params?)` replaces `{name}` placeholders; unknown
  placeholders stay as written and a missing key returns the key.
- The translator is frozen and pure. It does not call the host.

Contributions are registered once per Worker session. When the user changes the
app language the host rebuilds the plugin runtime and runs `setup` again, so
titles you register through `api.i18n` follow the new language automatically.
Do not cache translated strings across sessions. If a Worker restarts, it
receives the same catalog again.

## Reserved keys

The host reads these keys itself; no plugin code runs.

| Key | Used for |
| --- | --- |
| `manifest.name` | Plugin name in Settings → Plugins |
| `manifest.description` | Plugin description |
| `settings.<fieldKey>.label` | Settings field label |
| `settings.<fieldKey>.description` | Settings field description |
| `settings.<fieldKey>.placeholder` | Settings field placeholder |
| `settings.<fieldKey>.options.<optionValue>` | Label of a `select` option |

For settings the catalog wins over the text in `settingsSchema`, which stays as
the fallback. Marketplace entries that are not installed are localized from the
same files before installation.

## Frames and workspace views

Tier 2 block frames and workspace views run outside the Worker and do not get
`api.i18n`. They receive the app `locale` (see [UI and custom
blocks](./ui.md)). Bundle your catalogs into the frame and use the same
translator:

```ts
import { createTranslator } from '@nevo/plugin-sdk'
import ru from '../locales/ru.json'
import en from '../locales/en.json'

const catalogs = { ru, en } as Record<string, Record<string, string>>

function translatorFor(locale: string) {
  const base = locale.split('-')[0] ?? 'en'
  return createTranslator({ ...en, ...catalogs[base], ...catalogs[locale] }, locale)
}
```

`createTranslator(messages, locale)` is exported from the SDK root and works in
any environment.

## Plurals

Catalogs have no plural syntax. Use one key per category and pick it with
`Intl.PluralRules`:

```ts
const rule = new Intl.PluralRules(api.i18n.locale).select(count)
const text = api.i18n.t(`items.${rule}`, { count })
```

```json
{ "items.one": "{count} item", "items.other": "{count} items" }
```

## Testing

`createTestPluginHost(id, plugin, capabilities, { locale, messages })` passes a
catalog to `api.i18n`. Without it the host uses locale `en` and an empty
catalog, so `t()` returns keys.

## Not covered

Trusted V1 plugins (`trusted-webview`) do not get `api.i18n`. Use your own
mechanism there.
