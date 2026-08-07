import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

// The onefile build promises ONE self-contained index.html. Our webfonts live in
// public/fonts/ and are referenced as `/fonts/x.woff2`, which would leave that
// build depending on sibling files (and broken when opened from disk). Inline
// them as data: URIs so the promise holds — and so onefile works fully offline,
// which it never did while the fonts came from Google's CDN.
function inlineFonts(outDir) {
  return {
    name: "whisker:inline-fonts",
    apply: "build",
    enforce: "post",
    closeBundle() {
      const html = path.join(outDir, "index.html");
      if (!existsSync(html)) return;
      let out = readFileSync(html, "utf8");
      let inlined = 0;
      // Vite emits these as `./fonts/x.woff2` in onefile mode and `/fonts/x.woff2`
      // elsewhere — accept both, quoted or bare.
      out = out.replace(/url\((["']?)\.?\/fonts\/([\w-]+\.woff2)\1\)/g, (whole, _q, file) => {
        const src = path.join("public", "fonts", file);
        if (!existsSync(src)) return whole;
        inlined++;
        return `url(data:font/woff2;base64,${readFileSync(src).toString("base64")})`;
      });
      if (inlined) {
        writeFileSync(html, out);
        console.log(`  inlined ${inlined} font file(s) into ${html}`);
      }
    },
  };
}

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
      plugins.push(viteSingleFile(), inlineFonts(outDir));
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
