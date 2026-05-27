# Phase 6 — Polish (Apple-level finish)

## Enforce consistency

| Rule | Implementation |
|------|-----------------|
| **One font family** | Inter only (`index.html` + `body` + Tailwind `font-sans`). No other font imports. |
| **One spacing system (8pt grid)** | CSS vars `--grid-8` … `--grid-48` in `src/index.css`. Tailwind spacing 2=8px, 4=16px, 6=24px. Modal overlay padding uses `max(var(--grid-16), safe-area)`. |
| **Equal card heights** | Orders stat cards: `min-h-[7.5rem]` + flex; Dashboard StatCards: `min-h-[8.5rem]`; grid items stretch by default. |
| **Button height consistency** | Primary/secondary/action use `min-height: var(--touch-min)` (44px). Orders action buttons: `min-h-touch inline-flex items-center justify-center`. Button component doc: prefer `md` for primary CTAs. |
| **Icon alignment** | Lucide icons: `strokeWidth={2}`, centered via `flex items-center justify-center` where in a container. StatCard, SyncStatusBar, Orders stats, Header MapPin updated. |
| **Mobile-first** | Layout and components use `min-h-[var(--min-h-viewport)]`, `100dvh` where supported, safe-area insets. |
| **Thumb-friendly buttons** | `min-h-touch` (44px), `touch-manipulation` on key actions; PaymentPanel quick amounts and Orders buttons use `min-h-touch`. |
| **No edge-touch elements** | Main content `pl/pr [max(1rem, var(--safe-left/right))]`; modal overlay `max(var(--grid-16), safe-area)`. |
| **Adequate padding (≥16px)** | `.solid-card` default `padding: 1rem` in `glassmorphism.css`; main content and modal overlay ≥16px. ProductSearch result rows `p-4`. |

## Final validation checklist

After Phase 6 fixes:

- **No transparent form backgrounds** — Forms use `.input-field` (solid `#fff`) and `.solid-card` / `.solid-panel` (no blur).
- **No overlapping menus or filters** — Dropdowns wrapped with `.input-select-wrapper` (z-index, isolation); Phase 3.
- **No jitter when opening drawers** — Fixed dimensions (Sidebar 280px, MobileMenu), `scroll-lock`, `overscroll-behavior: none`, `--min-h-viewport` / `--h-viewport`; Phase 2.
- **No false save success** — Phase 4: success toasts only on 2xx; local-only shows “Saved locally. Syncing when online.”
- **APIs resolve correctly across browsers** — Single base URL, timeouts, GET-only retry; Phase 4.
- **Mobile feels calm, stable, and deliberate** — Solid surfaces, 8pt grid, thumb-friendly targets, no edge-touch, reserved space for SyncStatusBar.

## Output expectations

- **Cleaned components** — Orders, StatCard, SyncStatusBar, Header, Button, Layout, ProductSearch, glassmorphism: padding/icons/height/comments updated.
- **Removed unused styles** — `.card`, `.card.glass-card`, `.bg-glass`, `.border-glass` removed from `index.css`; solid surfaces use `.solid-card` / `.solid-panel`.
- **Inline comments** — Phase 6 comments in `index.css`, `glassmorphism.css`, `tailwind.config.js`, `Button.tsx`, `Layout.tsx`, `StatCard.tsx`, `Orders.tsx`.
- **No regressions** — No removal of inventory/products/users/transactions; no API or schema changes.
- **No data loss** — Visual and layout only; no persistence logic changed.

## Files touched (Phase 6)

- `src/index.css` — 8pt grid vars, modal padding ≥16px, removed unused .card / .bg-glass / .border-glass, Phase 6 header comment.
- `src/styles/glassmorphism.css` — `.solid-card` default padding 1rem.
- `tailwind.config.js` — Phase 6 comment (font, 8pt, touch).
- `src/components/ui/Button.tsx` — Comments for Phase 6 (thumb-friendly, sm compact).
- `src/components/layout/Layout.tsx` — Comment for main padding / no edge-touch.
- `src/components/dashboard/StatCard.tsx` — Equal height, icon center, strokeWidth, comment.
- `src/components/SyncStatusBar.tsx` — Icons strokeWidth 2, shrink-0.
- `src/components/layout/Header.tsx` — MapPin strokeWidth 2.
- `src/components/pos/ProductSearch.tsx` — Result row padding p-4.
- `src/pages/Orders.tsx` — Stat cards equal height, icons strokeWidth, action buttons min-h-touch rounded-xl touch-manipulation.
