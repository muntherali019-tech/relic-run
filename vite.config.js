import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Builds from one codebase:
//   `vite build --mode web`      -> dist-web      (website; payments via Stripe)
//   `vite build --mode app`      -> dist-app      (Capacitor wraps this for Google Play)
//   `vite build --mode onefile`  -> dist-onefile  (ONE self-contained index.html you can open or host anywhere)
// During `npm run dev`, calls to /api are proxied to the Express server on :8787
// so the browser never sees your Anthropic API key.
export default defineConfig(async ({ mode }) => {
  const plugins = [react()];
  const outDir = mode === "app" ? "dist-app" : mode === "onefile" ? "dist-onefile" : "dist-web";

  // Single-file build: inline all JS/CSS into one index.html.
  if (mode === "onefile") {
    try {
      const { viteSingleFile } = await import("vite-plugin-singlefile");
      plugins.push(viteSingleFile());
    } catch {
      console.warn("\n  vite-plugin-singlefile not installed. Run:  npm install -D vite-plugin-singlefile\n");
    }
  }

  return {
    plugins,
    build: { outDir, emptyOutDir: true },
    server: { port: 5173, proxy: { "/api": "http://localhost:8787" } },
    // Vitest owns the src/ specs only — client code needs a DOM (localStorage,
    // window). The suites in test/ and tests/ are node:test and are run
    // separately by `node --test`; keep this include narrow so the two runners
    // never pick up each other's files.
    test: {
      globals: true,
      environment: "jsdom",
      setupFiles: ["./vitest.setup.js"],
      include: ["src/**/*.{test,spec}.{js,jsx}"],
    },
  };
});
