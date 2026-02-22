#!/usr/bin/env node
/**
 * GET /api/warehouses smoke check for CI.
 * - Without AUTH_TOKEN: expects 401 (route exists and requires auth).
 * - With AUTH_TOKEN: expects 200 and response is an array.
 * Usage: BASE_URL=http://localhost:3001 node scripts/warehouses-check.mjs
 *        AUTH_TOKEN=Bearer <token> BASE_URL=... node scripts/warehouses-check.mjs
 */
const base = process.env.BASE_URL || 'http://localhost:3001';
const token = process.env.AUTH_TOKEN?.trim();
const url = `${base.replace(/\/$/, '')}/api/warehouses`;

async function main() {
  const headers = {};
  if (token) headers['Authorization'] = token.startsWith('Bearer ') ? token : `Bearer ${token}`;

  const res = await fetch(url, { headers });
  const body = await res.json().catch(() => ({}));

  if (token) {
    if (!res.ok) {
      console.error(`Warehouses check failed: ${res.status}`, body);
      process.exit(1);
    }
    if (!Array.isArray(body)) {
      console.error('Warehouses check failed: response is not an array', body);
      process.exit(1);
    }
    console.log('Warehouses check OK:', body.length, 'warehouse(s)');
    return;
  }

  if (res.status !== 401) {
    console.error(`Warehouses check (no auth): expected 401, got ${res.status}`, body);
    process.exit(1);
  }
  console.log('Warehouses check OK (route requires auth, got 401)');
}

main().catch((err) => {
  console.error('Warehouses check error:', err.message);
  process.exit(1);
});
