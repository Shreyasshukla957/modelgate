import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  root: "frontend",
  plugins: [react(), tailwindcss()],
  build: { outDir: "../frontend-dist", emptyOutDir: true },
  server: { port: 5173, proxy: { "/v1": "http://127.0.0.1:3000", "/health": "http://127.0.0.1:3000" } },
});
