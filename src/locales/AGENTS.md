# Localization Guidelines

These rules apply to `src/locales/**` in addition to the repository root instructions.

- Use `src/i18n.ts` as the source of truth for registered locale catalogs.
- Keep every registered locale key-for-key compatible with English unless fallback behavior is explicitly intended and tested.
- Preserve vue-i18n interpolation names, pluralization syntax, markup placeholders, and product terminology.
- Add keys to the correct semantic namespace; do not reuse an unrelated string merely because its English text matches.
- Keep JSON valid and avoid mechanical reordering of unrelated entries.
- When adding a locale, update imports/messages in `src/i18n.ts`, the `AppLocale` type and normalization, language selectors, persisted settings handling, and locale tests.
- Run `pnpm exec vitest run src/locales/locales.test.ts src/i18n.test.ts` after locale or locale-registration changes.
