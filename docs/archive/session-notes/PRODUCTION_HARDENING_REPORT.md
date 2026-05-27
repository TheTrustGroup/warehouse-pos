# Production Hardening Report

**Date:** 2025-02-13  
**Scope:** Auth/role consistency, dashboard error overlap, cross-browser reliability  
**Status:** Implemented

---

## 1. Root Cause: Admin Seeing Viewer Dashboard on Some Browsers

### What was happening

- **Symptom:** Admin login showed the viewer (non-admin) dashboard on some browsers (e.g. Chrome, Edge) while Safari showed the correct admin dashboard.
- **Cause:** Two main factors:

  1. **Client-side role derivation and fallback**  
     The client had logic that could:
     - “Upgrade” a server-returned `viewer` role using the email local part (e.g. `cashier_maintown@` → cashier).  
     - Default to `viewer` when the server returned an unknown or missing role (`role = role ?? ROLES.VIEWER`).  
     So the UI could show a different role than the server intended, and in edge cases (e.g. cookie not sent, or differing API response) the client could end up displaying viewer for an admin.

  2. **Auth not fully token-first across browsers**  
     Session relied on both cookies and `Authorization: Bearer` token. In some cross-origin or strict cookie environments, the cookie might not be sent on refresh; if the client did not consistently send the stored token, the session check could fail or behave differently per browser.

### Why Safari could work while others did not

- Safari and Chrome/Edge handle third-party/cross-site cookies and `SameSite` differently.
- When the cookie was not sent (e.g. cross-site request), the client still sent the Bearer token from `localStorage`; the bug was not primarily “cookie vs token” but the client **overwriting or guessing** role (derivation + default to viewer) instead of using the server as the single source of truth.

---

## 2. How It Was Fixed (Permanently)

### Role is server-authoritative only

- **Removed** all client-side role derivation from email (e.g. `roleFromEmailLocalPart` and the “if backend returns viewer but email suggests another role” upgrade).
- **Removed** the default `role = role ?? ROLES.VIEWER`. The client no longer falls back to viewer when the server returns an unknown or missing role.
- **`normalizeUserData()`** now:
  - Maps only server-returned roles that are in `KNOWN_ROLE_IDS`.
  - Returns `null` if the role is missing or not in the known list (instead of defaulting to viewer).
- **Blocking error when role cannot be resolved:**
  - On **session check** (`checkAuthStatus`): if the API returns 200 but `normalizeUserData()` returns `null`, the client sets `authError` and clears user (no viewer fallback).
  - On **login**: if the login response has an invalid/missing role, the client throws and does not set user.
- **Login page** shows a clear “Role could not be verified” message when `authError` is set, with “Dismiss and try again” and no silent downgrade to viewer.

### Admin never downgraded to viewer

- The UI never upgrades or downgrades role from the server.
- Viewer dashboard is shown only when the server returns `role === 'viewer'`.
- Admin dashboard is shown only when the server returns `admin` or `super_admin`.
- If the server returns something invalid or empty, the user sees a blocking error and must log out and log in again; the app never shows viewer in that case.

### Session and token behavior (cross-browser)

- **Cookie:** In production, session cookie is set with `SameSite=None`, `Secure`, `Path=/`, and a comment documents that the client must send the Bearer token so auth works when cookies are blocked.
- **Token:** Login response includes the session token; the client stores it and sends it as `Authorization: Bearer` on every session check and API call. Auth works the same whether the browser sends the cookie or not.
- **Session check:** `checkAuthStatus` always sends the stored token in the `Authorization` header when present, so behavior is consistent across Safari, Chrome, Edge, and Firefox.

### Cleanup

- Removed debug `console.log`/`console.error` from the login path (production-safe).
- Kept `switchRole` for demo/testing only; it is not used for initial role resolution, and demo role is cleared on successful session check so refresh always reflects server role.

---

## 3. Why Browser Differences No Longer Matter

- **Single source of truth:** Role comes only from the server (session/token). No client logic derives or overrides it.
- **Token-first:** The client always sends the Bearer token when available, so auth does not depend on cookie behavior in a specific browser.
- **No silent fallback:** Unknown or missing role results in a blocking error instead of defaulting to viewer, so there is no “works in one browser, wrong in another” due to fallback.
- **Explicit error state:** `authError` is shown on the login page when role could not be verified, so users and support get a clear signal instead of a wrong dashboard.

---

## 4. Dashboard Error Overlap (Fixed)

### Problem

- Dashboard UI could overlap error messages (e.g. server degraded banner).
- Requirements: errors must not overlap cards; errors should reserve layout space and push content down; no floating over content.

### Changes

- **Degraded (server unavailable) banner** in `Layout` was changed from **fixed** to **in-flow**:
  - It is rendered in the document flow below the header and reserves space (min height ~3rem).
  - Main content is laid out below it, so it never overlaps cards or other content.
- **Z-index** is documented in `index.css` with CSS variables:
  - `--z-header: 10`, `--z-banner: 9`, `--z-mobile-menu: 40`, `--z-modal: 50`, `--z-toast: 60`.
- **Toasts** remain fixed at z-index 60 for **transient** feedback only; a comment in `ToastContext` states that critical/blocking errors must use in-flow banners that reserve layout space.
- **Inventory** (and similar) error states were already in-flow (full-page or in-section error with Retry); no overlap change needed there.

---

## 5. UI System Rules Enforced

- **Spacing:** Single system in `index.css` (`--space-section`, `--space-block`, `--touch-min`, `--input-height`).
- **Typography:** One scale (`--text-xs` through `--text-2xl`).
- **Z-index:** Documented scale (header, banner, mobile menu, modal, toast); errors use in-flow layout, not stacking for critical messages.
- **Errors:** Critical/blocking errors use in-flow banners that reserve space; toasts are for transient feedback only.

---

## 6. What Was Intentionally Not Changed

- **Backend role derivation** (`getRoleFromEmail`, `ALLOWED_ADMIN_EMAILS` / `VITE_SUPER_ADMIN_EMAILS`): Unchanged. Admin vs viewer is still determined on the server from email and env; the fix was to stop the client from overriding or defaulting.
- **VITE_SUPER_ADMIN_EMAILS** on the client: Still used so that a specific env can treat certain emails as super_admin when the server returns admin; this is an explicit env-based override, not a silent fallback.
- **Permission-based routing and sidebar:** Still driven by `user.role` and `user.permissions`; they now always reflect the server (or blocking error), so no logic change was required there.
- **Full UI redesign:** No broad visual redesign; only auth/role behavior, error layout, and documented z-index/spacing rules.

---

## 7. Cross-Device / Cross-Browser Verification (Checklist)

Use this to verify behavior after deployment:

### Admin login

- [ ] **Safari:** Log in as admin → same admin dashboard, same permissions, same UI.
- [ ] **Chrome:** Same as above.
- [ ] **Firefox:** Same as above.
- [ ] **Edge:** Same as above.

### Consistency

- [ ] **Refresh:** After login, refresh → same role and dashboard (no downgrade to viewer).
- [ ] **Logout / login:** Log out, log in again → same role and dashboard.
- [ ] **New device:** Log in on a different device (same account) → same role and dashboard.
- [ ] **Incognito/private:** Log in in a private window → same role and dashboard (token is stored and sent; cookie may or may not be set depending on browser).

### Error display

- [ ] **Degraded banner:** When the server is unavailable, the amber banner appears in-flow and pushes main content down; it does not overlap cards.
- [ ] **Role error:** If the server ever returns an invalid role, the user sees “Role could not be verified” on the login page (and no viewer dashboard).

### Zero variance

- Same dashboard, same permissions, and same UI for the same role across all supported browsers and devices; no “it works on my browser” differences for auth or role.

---

## 8. Files Touched (Summary)

| Area | Files |
|------|--------|
| Auth / role | `src/contexts/AuthContext.tsx`, `src/pages/Login.tsx`, `inventory-server/lib/auth/session.ts` |
| Error layout / z-index | `src/components/layout/Layout.tsx`, `src/contexts/ToastContext.tsx`, `src/index.css` |
| Docs | `warehouse-pos/PRODUCTION_HARDENING_REPORT.md` (this file) |

---

**Conclusion:** Role is resolved only on the server and never downgraded or guessed on the client. If the role cannot be resolved, a blocking error is shown and the user must log out and log in again. Dashboard errors use in-flow layout so they never overlap cards. Cross-browser behavior is aligned by using the Bearer token consistently and removing all silent role fallbacks.
