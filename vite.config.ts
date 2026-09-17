import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(), 
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Inline the bundled woff2 font files as data URIs so they survive in
  // standalone HTML exported to PDF (headless Edge reads the temp file at
  // file://, where a relative /assets/*.woff2 URL cannot resolve).
  build: {
    chunkSizeWarningLimit: 2000,
    assetsInlineLimit: 100000,
  },
  // Add this block right here:
  server: {
    port: 1420,
    strictPort: true,
  }
});