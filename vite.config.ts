import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    strictPort: true,
    // Visual Builder loads the site inside an iframe on the Contentstack app
    // origin, so the dev server must not refuse framing.
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
  },
});
