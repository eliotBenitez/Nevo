import { defineConfig } from 'vitest/config'

// Keeps the SDK suite from inheriting the app's root Vite config (Vue, jsdom, globalSetup).
export default defineConfig({
  test: {
    environment: 'node',
  },
})
