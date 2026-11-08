import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// During "npm run dev" the /api calls go to a backend on this computer.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": "http://localhost:8000" } },
});
