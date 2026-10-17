import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import vue from 'eslint-plugin-vue'
import globals from 'globals'

// Flat config for the Nevo frontend. Enables the recommended TypeScript + Vue
// rule sets as guardrails. Purely-stylistic Vue template formatting rules are
// disabled so the linter reports real issues, not whitespace.
export default tseslint.config(
  {
    ignores: [
      'dist/**',
      // Workspace packages emit their own build output; linting generated
      // JavaScript reports errors that have no source to fix.
      'packages/*/dist/**',
      'node_modules/**',
      'src-tauri/**',
      'public/**',
      '*.config.*',
      'coverage/**',
      // Local git worktrees carry their own tsconfig and confuse the TS parser.
      '.worktrees/**',
      '.claude/**',
      // Local visual-QA sessions, probes and build output (git-ignored).
      '.qa/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Node-only tooling scripts (visual QA driver, build helpers).
    files: ['tools/**/*.mjs', 'build-tools/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.{ts,vue}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { parser: tseslint.parser },
    },
    rules: {
      // TypeScript / vue-tsc already resolve identifiers; `no-undef` only
      // produces false positives for DOM/Node globals in typed files.
      'no-undef': 'off',
      // Surface remaining `any` usages without failing the whole tree.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      // Purely-stylistic template formatting — out of scope for linting here.
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/multiline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
      'vue/multi-word-component-names': 'off',
    },
  },
  {
    // UI icons go through the user-selectable icon set (src/ui/icons).
    files: ['src/**/*.{ts,vue}'],
    ignores: [
      'src/ui/icons/**',
      'src/ui/primitives/iconPickerIcons.ts',
      'src/ui/primitives/NvNoteIcon.vue',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@lucide/vue',
              message: "Import icons from the 'ui/icons' module (src/ui/icons) so the selected icon set applies.",
            },
          ],
        },
      ],
    },
  },
  {
    // Test files use inline stub components and type casts that are fine in
    // tests but would otherwise trip component/any rules.
    files: ['**/*.test.ts', '**/__tests__/**'],
    rules: {
      'vue/one-component-per-file': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
)
