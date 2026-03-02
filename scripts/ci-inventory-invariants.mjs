#!/usr/bin/env node
/**
 * CI invariant checks for inventory reliability (P0).
 * Run in CI: node scripts/ci-inventory-invariants.mjs
 *
 * Strict env check (fails if VITE_API_BASE_URL missing) runs only when
 * CHECK_ENV=1 is set (e.g. in deploy or a dedicated env-validation job).
 * This allows npm run ci (test + build) to pass in CI without secrets;
 * set CHECK_ENV=1 and VITE_API_BASE_URL when you want to enforce the URL.
 */
const checkEnv = process.env.CHECK_ENV === '1';

function fail(msg) {
  console.error('[INVENTORY RELIABILITY]', msg);
  process.exit(1);
}

if (checkEnv) {
  const apiBase = process.env.VITE_API_BASE_URL;
  if (!apiBase || String(apiBase).trim() === '') {
    fail('VITE_API_BASE_URL must be set when CHECK_ENV=1. No default allowed.');
  }
  console.log('[INVENTORY RELIABILITY] VITE_API_BASE_URL is set (invariant OK).');
}

console.log('Inventory invariant checks passed.');
