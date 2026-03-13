import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  resolve: { preserveSymlinks: true },
  optimizeDeps: { exclude: ["@aivox/sdk"] },
});
