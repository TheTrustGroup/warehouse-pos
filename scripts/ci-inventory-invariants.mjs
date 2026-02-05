#!/usr/bin/env node
/**
 * CI invariant checks for inventory reliability (P0).
 * Fails the build if:
 * - VITE_API_BASE_URL is missing when building for production (no default allowed).
 * Run in CI before or after build: node scripts/ci-inventory-invariants.mjs
 * Set CHECK_ENV=1 to verify production env is set (e.g. in CI).
 */
const isCI = process.env.CI === 'true' || process.env.CI === '1';
const isProduction = process.env.NODE_ENV === 'production' || isCI;
const checkEnv = process.env.CHECK_ENV === '1' || isProduction || isCI;

function fail(msg) {
  console.error('[INVENTORY RELIABILITY]', msg);
  process.exit(1);
}

if (checkEnv) {
  const apiBase = process.env.VITE_API_BASE_URL;
  if (!apiBase || String(apiBase).trim() === '') {
    fail('VITE_API_BASE_URL must be set in production/CI. No default allowed.');
  }
  console.log('[INVENTORY RELIABILITY] VITE_API_BASE_URL is set (invariant OK).');
}

console.log('Inventory invariant checks passed.');
