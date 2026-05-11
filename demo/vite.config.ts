import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath } from "node:url";

// In dev: resolve @audarai/sdk straight to its TypeScript source instead of
// the tsup-built dist. Vite watches src/ and HMRs on every SDK edit, so we
// never have to `npm run build` the SDK or wipe node_modules/.vite during
// development. The published `file:..` dep + dist still wins in production.
const sdkSrc = fileURLToPath(new URL("../src/index.ts", import.meta.url));

export default defineConfig({
  plugins: [vue()],
  resolve: {
    preserveSymlinks: true,
    alias: { "@audarai/sdk": sdkSrc },
  },
  server: {
    allowedHosts: true,
  },
});
