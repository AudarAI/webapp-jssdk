## Dependency Management System

This repository uses **npm** as its package manager with a lightweight monorepo structure based on local file references rather than npm workspaces.

### Architecture

The repo contains two distinct packages:
1. **`@audarai/sdk`** (root) — The core TypeScript SDK library published to npm
2. **`audarai-sdk-demo`** (`demo/`) — A Vue 3 demo application that consumes the SDK locally

### Key Mechanism: Local File Reference

Instead of using npm workspaces, the demo app declares the SDK as a dependency via a relative file path:
```json
"dependencies": {
  "@audarai/sdk": "file:.."
}
```

This creates a symlink in `node_modules/@audarai/sdk` pointing to the parent directory, enabling real-time development where changes to the SDK are immediately reflected in the demo without republishing.

### Version Pinning Strategy

- **SDK package**: Uses caret ranges for dev dependencies (`^8.0.0`, `^5.0.0`), allowing minor/patch updates
- **Demo app**: Uses caret ranges for all dependencies (`^2.18.0`, `^3.5.0`, `^5.0.0`)
- Both packages maintain separate `package-lock.json` files with lockfileVersion 3 (npm v7+)

### Registry Configuration

All resolved packages point to `https://registry.npmmirror.com`, indicating the project uses the Chinese npm mirror (npmmirror, formerly Taobao registry) for faster dependency resolution in China.

### Build Toolchain

- **SDK**: Built with `tsup` (v8.x) producing CJS, ESM, and type definitions
- **Demo**: Built with Vite (v5.x) + Vue plugin, type-checked with `vue-tsc`
- Both use TypeScript 5.x

### Developer Workflow Rules

1. **Install dependencies separately** in each directory (`npm install` at root, then `cd demo && npm install`)
2. **Build SDK before running demo**: The `prepare` script auto-builds on install, but manual `npm run build` may be needed during active development
3. **No shared node_modules**: Each package maintains its own isolated dependency tree
4. **Lockfiles committed**: Both `package-lock.json` files should be committed to ensure reproducible builds
5. **No private registries or authentication**: All dependencies come from public npm mirrors