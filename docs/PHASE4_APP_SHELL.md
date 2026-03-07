# Phase 4 — App shell

App shell is the persistent layout: sidebar, topbar, mobile drawer, bottom nav, and in-flow banners. All use EDK design tokens (`--edk-*`) and brand (Barlow Condensed, primary red `#E8281A`).

## Components

| Component | Role | Tokens / notes |
|-----------|------|----------------|
| **Layout** | Wraps `<Outlet />`; owns sidebar offset, header offset, banners, main padding, bottom nav padding. | `--edk-bg`, `--edk-sidebar-w`, `--edk-topbar-h`, `--safe-*`, `--min-h-viewport` |
| **Sidebar** | Desktop: fixed 240px, dark `--edk-sidebar-bg`, EE logo + “Extreme Dept / Kidz · Inventory & POS”, nav (active red tint), warehouse pill, user initial. | `--edk-sidebar-bg`, `--edk-red`, `--edk-green`, `--edk-radius-sm` |
| **Header** | Top bar: search (single source for inventory), RealtimeSyncIndicator, Log out (Button with `loading` + `leftIcon`), Notifications. Hidden on `/pos`. | `--edk-surface`, `--edk-border`, `--edk-ink*`, `--edk-red` focus |
| **MobileMenu** | Drawer (same width as sidebar): same brand block and nav/warehouse/user styling as Sidebar so mobile matches desktop. | Same as Sidebar |
| **MobileBottomNav** | Tab bar on small viewports; active tab uses `--edk-red` tint. | `--edk-surface`, `--edk-border`, `--edk-red`, `--edk-ink-2` |
| **MoreMenuSheet** | Bottom sheet “More”: overflow nav links, warehouse, role, Log out. | `--edk-surface`, `--edk-border`, `--edk-ink*`, `--edk-red` active |

## Banners (in-flow, reserve layout space)

- **Syncing** (inventory & orders): `--edk-amber-bg`, `--edk-amber` text + spinner.
- **Critical data error** / **Degraded (server unavailable)**: `--edk-amber` background, `--edk-ink` text; Retry / Dismiss use ghost Button with `--edk-ink` focus ring.
- **Reconnecting** (realtime): `--edk-amber-bg`, `--edk-ink` text.

## Breakpoint

- **Mobile:** `max-width: 1023px` (MOBILE_BREAKPOINT 1024 in Layout). Sidebar hidden; Header + MobileBottomNav; MobileMenu or MoreMenuSheet for nav.

## Fonts

- Sidebar / mobile drawer / More title: **Barlow Condensed** for wordmark and “More”.
- Body / nav labels / header: **DM Sans** or **Inter** (Header uses DM Sans via style).

## Verification

1. Desktop: Sidebar visible; Header with search and Log out; main content offset by sidebar and topbar.
2. Mobile: No sidebar; Header; bottom tab bar; opening menu shows dark drawer matching Sidebar look.
3. Log out: Button shows loading spinner + “Signing out…” while logging out.
4. Banners: Syncing / error / reconnecting use amber and `--edk-*`; no raw Tailwind amber/slate for shell.
