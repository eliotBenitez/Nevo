import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import vueDevTools from 'vite-plugin-vue-devtools'

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [
    vue(),
    vueDevTools()
  ],
  test: {
    environment: "jsdom",
    globals: true,
  },

  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return
          // mermaid / vega / markmap intentionally omitted: they are already
          // split into their own chunks via dynamic import().
          if (id.includes("/prosemirror-")) return "vendor-prosemirror"
          if (/\/(yjs|y-prosemirror|y-protocols|y-websocket)\//.test(id)) return "vendor-yjs"
          if (/\/(vue|vue-router|@vue|pinia|@vueuse|vue-i18n)\//.test(id)) return "vendor-vue"
          if (/\/(unified|remark-[^/]+|mdast-[^/]+|micromark[^/]*|unist-[^/]+)\//.test(id)) return "vendor-unified"
          if (id.includes("/katex/")) return "vendor-katex"
          if (id.includes("/highlight.js/")) return "vendor-highlight"
          if (/\/d3-(force|zoom|drag|selection|dispatch|timer|quadtree|transition|interpolate|color|ease)\//.test(id)) return "vendor-d3"
        },
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
