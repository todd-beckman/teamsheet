import { defineConfig } from "vite";

export default defineConfig({
  // Mirrors the playgroundgl layout: index.html lives in src/, static assets
  // (the fillable PDF) in public/, build output to dist/.
  root: "src",
  publicDir: "../public",
  // Relative base so the built site works under a GitHub Pages project subpath
  // (https://<user>.github.io/<repo>/).
  base: "./",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
});
