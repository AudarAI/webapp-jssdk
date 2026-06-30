The AudarAI JavaScript SDK uses a lightweight, script-driven build system based on **npm** and **tsup**, organized as a local workspace monorepo.

### Build Tools & Approach
- **SDK Library (`@audarai/sdk`)**: Built using **tsup**, a zero-config bundler for TypeScript. It compiles the library into both CommonJS (`dist/index.js`) and ESM (`dist/index.mjs`) formats, while generating TypeScript declaration files (`dist/index.d.ts`).
- **Demo Application (`audarai-sdk-demo`)**: Built using **Vite** with the `@vitejs/plugin-vue`. It serves as a development harness and is compiled for production using `vue-tsc` for type-checking followed by `vite build`.
- **Package Manager**: Uses **npm** (evidenced by `package-lock.json`). The demo app links to the SDK via a local file dependency (`"@audarai/sdk": "file:.."`).

### Key Build Scripts
- **SDK Build**: `npm run build` executes `tsup src/index.ts --format cjs,esm --dts --clean`.
- **SDK Dev Mode**: `npm run dev` runs tsup in watch mode.
- **Demo Build**: `npm run build` executes `vue-tsc && vite build`.
- **Demo Dev Mode**: `npm run dev` starts the Vite dev server with `--host` enabled.

### Architecture & Conventions
- **Local Workspace Linking**: The monorepo structure relies on npm's `file:` protocol to link the demo app to the SDK source. This avoids the need for a complex workspace manager like Lerna or Nx.
- **Dev-Time Source Resolution**: The `demo/vite.config.ts` includes a specific resolution alias that points `@audarai/sdk` directly to the SDK's TypeScript source (`../src/index.ts`) during development. This enables Hot Module Replacement (HMR) for SDK changes without requiring a rebuild of the SDK package, significantly speeding up the inner development loop.
- **TypeScript Configuration**: Both projects use strict TypeScript settings with `ES2020` as the target. The SDK uses `moduleResolution: bundler`, aligning with modern tooling expectations.

### Developer Rules
- **Building for Publish**: Always run `npm run build` in the root directory before publishing to ensure the `dist/` folder is populated with the latest CJS, ESM, and type definitions.
- **Demo Development**: When working on the demo, no manual SDK build is required due to the Vite alias configuration. Changes in `src/` are immediately reflected in the demo app.
- **Dependency Management**: Run `npm install` in both the root and `demo/` directories. The demo's `package.json` explicitly depends on the local parent directory for the SDK.