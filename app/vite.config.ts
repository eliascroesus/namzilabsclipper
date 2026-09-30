import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// `base: "./"` keeps every asset path relative, so the built site works from any
// folder: GitHub Pages' /namzilabsclipper/, Vercel's root, or a local preview.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    target: "es2022",
    // Mediabunny is one big module; the WASM AAC encoder loads only where a browser lacks one.
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        // The second page: an edit copied from a reference video.
        mimic: resolve(import.meta.dirname, "mimic.html"),
        // A bare page the browser tests drive; it ships but nothing links to it.
        harness: resolve(import.meta.dirname, "harness.html"),
      },
    },
  },
  server: { port: 5173, strictPort: true },
});
