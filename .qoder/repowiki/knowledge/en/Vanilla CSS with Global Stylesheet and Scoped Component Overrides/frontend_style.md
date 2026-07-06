## Styling System Overview

The AudarAI SDK demo application uses a **vanilla CSS** approach with no CSS framework, preprocessor, or utility library. Styling is organized into two layers:

1. **Global stylesheet** (`demo/src/style.css`) — defines all shared design tokens, layout primitives, and reusable component classes.
2. **Scoped component styles** (`<style scoped>` blocks in `.vue` files) — used sparingly for panel-specific overrides that don't belong in the global sheet.

---

## Key Files

| File | Purpose |
|------|---------|
| `demo/src/style.css` | Single global CSS file (~276 lines) containing all base styles, layout rules, form elements, buttons, cards, log boxes, drop zones, speaker chips, and status indicators. |
| `demo/src/App.vue` | Root layout component; uses only global CSS classes (`.layout`, `.sidebar`, `.nav`, `.main`, `.badge-*`). No `<style>` block. |
| `demo/src/components/*.vue` | Nine feature panels. Most rely entirely on global classes. Five use small `<style scoped>` blocks for panel-specific tweaks (tables, message lists, voice-status dots, etc.). |
| `demo/vite.config.ts` | Vite config with Vue plugin; no CSS-related plugins or postprocessors configured. |
| `demo/package.json` | No CSS dependencies (no Tailwind, Sass, PostCSS plugins, or CSS-in-JS libraries). |

---

## Architecture and Conventions

### Design Tokens (Hardcoded)

Colors, spacing, and typography are defined as **literal values** directly in CSS rules — there are no CSS custom properties (`--var`), no theme files, and no token abstraction layer. Key palette:

- **Backgrounds**: `#f5f5f7` (page), `#fff` (cards/sidebar), `#1a1a1e` (log/subtitle dark panels)
- **Text**: `#1d1d1f` (primary), `#888`/`#999` (muted), `#444`/`#555` (secondary)
- **Accent/Action**: `#1a73e8` (primary blue), `#ea4335` (danger red), `#34a853` (success green)
- **Borders**: `#e5e5e7` (light), `#d1d1d6` (input borders)
- **Font stack**: `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`

A handful of scoped styles reference CSS variables like `var(--border, #e2e8f0)` and `var(--text-muted, #6b7280)`, but these variables are **never declared** anywhere in the codebase — they silently fall back to the hardcoded defaults, making them effectively dead code.

### Layout Strategy

- **Two-column grid**: `.layout` uses `grid-template-columns: 260px 1fr` for sidebar + main content.
- **Sticky header**: Fixed at 49px height with `position: sticky; top: 0`.
- **Sticky sidebar**: Scrolls independently within `calc(100vh - 49px)`.
- **Card-based content**: Each feature section is wrapped in `.card` (white background, rounded corners, subtle border).

### Component Class Naming

Classes follow a **flat, BEM-lite convention** with descriptive prefixes:
- `.btn`, `.btn-primary`, `.btn-outline`, `.btn-danger` — button variants
- `.card`, `.field`, `.row`, `.btn-row` — layout primitives
- `.speaker-chip`, `.drop-zone`, `.log-box`, `.badge-*` — domain-specific components
- `.nav-item.active`, `.ws-dot.connected` — state modifiers via additional classes

No CSS modules, no scoped hash generation for global classes, and no naming collision concerns because all panels share the same flat namespace.

### Scoped Style Usage Pattern

Of the 9 panel components, **all 9 contain `<style scoped>` blocks**, but their scope varies:

- **Minimal overrides** (ConnectPanel): 3 small rules for relay-profile background, action button row layout, and a local `.btn-danger` variant.
- **Moderate complexity** (AgentPanel, RoomPanel): ~200 lines of scoped CSS for tables, message lists, voice-status animations, subtitle rendering, and session info cards.

Scoped styles coexist with global classes in the same component. For example, `TtsPanel.vue` uses zero scoped styles and relies entirely on `.card`, `.row`, `.field`, `.btn-*`, `.speaker-chip`, and `.audio-player` from the global sheet.

### Responsive Strategy

**No responsive breakpoints** are defined. The layout assumes a desktop viewport:
- Sidebar is fixed at 260px with no collapse behavior.
- `.row > *` has `min-width: 110px` and `flex-wrap: wrap` for minor horizontal adaptation.
- No media queries exist anywhere in the codebase.

---

## Rules Developers Should Follow

1. **Add new shared styles to `demo/src/style.css`** — do not create new CSS files. Keep the single-file convention.
2. **Reuse existing class names** — `.card`, `.field`, `.row`, `.btn`, `.btn-primary`, `.btn-outline`, `.btn-danger`, `.speaker-chip`, `.log-box`, `.drop-zone`, `.badge-*`. Do not invent parallel variants.
3. **Use `<style scoped>` only for panel-specific layouts** that have no reuse potential (e.g., AgentPanel's message list, RoomPanel's session table). If a pattern appears in 2+ panels, promote it to the global sheet.
4. **Do not introduce CSS frameworks or preprocessors** — the project intentionally has zero CSS build tooling. Adding Tailwind, Sass, or styled-components would require significant config changes.
5. **Avoid CSS custom properties** unless you also declare them globally. The existing `var(--border, ...)` references in scoped styles are non-functional and should be replaced with literal values or properly declared tokens.
6. **No responsive design expected** — this is an internal developer test harness, not a production user-facing app. Mobile support is out of scope.
7. **State styling via class toggles** — use additive classes like `.active`, `.connected`, `.playing`, `.selected`, `.disabled` rather than inline styles or dynamic style bindings.
