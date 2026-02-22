# Page layout — canonical reference

All main app pages (Dashboard, Inventory, Reports, Settings, Orders, etc.) should match this layout so the product feels consistent.

## Reference implementation

**Inventory page** (`src/pages/InventoryPage.tsx`) is the design reference. New or updated pages should align with it.

## Layout rules

1. **Content background**  
   Use `bg-slate-100` for the main content area (e.g. dashboard wrapper, inventory main). This gives a clear separation from the app chrome and matches the inventory page.

2. **Page header**  
   - Title: `text-[20px] font-bold text-slate-900 leading-tight`  
   - One short subtitle or context line: `text-slate-500 text-sm`  
   - Optional: role badge or location (e.g. “You’re at: Main Store”) with icon.

3. **Cards**  
   Use `.solid-card` (defined in `src/styles/glassmorphism.css`) for content blocks: white background, subtle border, consistent radius (`--radius-card`). No blur; solid surfaces for readability and contrast.

4. **Sidebar**  
   Use `.solid-panel` for the fixed left nav (same file). Navigation is the single source for primary links; avoid duplicating those links as “quick access” grids on pages.

5. **Spacing**  
   Section spacing: `space-y-8` or `gap-6` between major blocks. Padding: `p-6 lg:p-8` for the main content wrapper. Respect safe areas on mobile (`var(--safe-*)`).

6. **Primary action**  
   At most one clear primary CTA per page (e.g. “New sale” on dashboard). Task-focused, not a duplicate of sidebar nav.

7. **Dashboard trends**  
   Any “% vs last period” (or similar) on the dashboard must use **real comparison data** from the API or derived metrics. Do not show hardcoded percentages. When you add trends, document the definition (e.g. “vs previous 7 days”) in the UI or a tooltip.

## Where styles live

- **Global tokens**: `src/index.css` — `:root` (spacing, radius, typography, z-index).  
- **Cards and panels**: `src/styles/glassmorphism.css` — `.solid-card`, `.solid-panel`, `.solid-overlay`.  
- **Buttons, inputs, nav**: `src/index.css` — `@layer components` (`.btn-primary`, `.input-field`, `.nav-item`, etc.).

When adding or changing pages, use these tokens and classes so the app stays consistent with the inventory page design.
