import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "/deck/",
  server: {
    proxy: {
      "/deck/api": "http://localhost:3000",
      "/api": "http://localhost:3000",
    },
  },
});
