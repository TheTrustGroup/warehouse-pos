# Cross-Browser Compatibility

This app is built to work across modern browsers (Chrome, Firefox, Safari, Edge) and degrades gracefully when storage or certain APIs are unavailable.

## Build & CSS

- **Autoprefixer**: PostCSS runs autoprefixer so vendor prefixes (`-webkit-`, `-moz-`, etc.) are added where needed. Target browsers come from `.browserslistrc` (`defaults`, `not dead`, `supports es6-module`).
- **Legacy build**: `@vitejs/plugin-legacy` produces a legacy bundle with polyfills (Promise, fetch, etc.) for older browsers. The app loads the legacy script when the browser doesn’t support modern ESM.
- **CSS**: Custom rules use standard properties with `-webkit-` prefixes where required (e.g. `backdrop-filter`, gradient text). `@supports` is used to fall back when `backdrop-filter` isn’t supported. Scrollbar styling uses `::-webkit-scrollbar` for WebKit and `scrollbar-width` / `scrollbar-color` for Firefox.

## Viewport & Meta

- **Viewport**: `index.html` includes a viewport meta tag with `width=device-width`, `initial-scale=1.0`, `viewport-fit=cover`, and `user-scalable=yes`.
- **Safe areas**: CSS variables `--safe-top`, `--safe-bottom`, etc. use `env(safe-area-inset-*)` for notched devices.

## Forms (Safari)

- **Date inputs**: Date range picker uses `type="date"` with `autoComplete="off"` and proper `id` / `htmlFor` / `aria-label` for accessibility and predictable behavior on Safari.
- **Labels**: Form labels are associated with inputs via `htmlFor` and `id` where applicable.

## Storage

- **localStorage / sessionStorage**: Usage is guarded with `typeof localStorage !== 'undefined'` where needed (e.g. `api.ts`, auth and context code).
- **Fallback**: `src/lib/storage.ts` provides `getStoredData`, `setStoredData`, `removeStoredData`, and `isStorageAvailable`. When `localStorage` is unavailable (private mode, old browsers), an in-memory fallback is used so the app doesn’t throw. Data in the fallback is session-only.
- **IndexedDB**: `offlineDb.ts` and `posEventQueue.ts` check `typeof indexedDB !== 'undefined'` before use.

## ES6+ and Polyfills

- **Legacy plugin**: The legacy build includes polyfills for Promise, fetch, and other features required by the target browsers.
- **TS target**: `tsconfig.json` uses `ES2020`; the legacy bundle is transpiled further by the plugin for older runtimes.

## Testing

- Run `npm run build` to ensure both modern and legacy bundles build.
- Manually test in Safari (desktop and iOS) for date inputs, storage, and layout.
- Test in Firefox and Chrome for consistency. Use private/incognito to verify storage fallback behavior.
