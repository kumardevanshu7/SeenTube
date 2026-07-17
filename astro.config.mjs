import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import react from "@astrojs/react";
import vercel from "@astrojs/vercel";

export default defineConfig({
  output: "server",
  adapter: vercel(),
  devToolbar: {
    enabled: false,
  },
  prefetch: {
    prefetchAll: true,
    defaultStrategy: "viewport",
  },
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      // Keep every Astro island and pre-bundled dependency on the same
      // React runtime. This prevents invalid hook calls after optimizer refreshes.
      dedupe: ["react", "react-dom"],
    },
  },
});