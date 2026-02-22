#!/usr/bin/env node
/**
 * GET /api/health smoke check. Exits 0 if status 200 and body.status === 'ok'.
 * Usage: BASE_URL=http://localhost:3001 node scripts/health-check.mjs
 */
const base = process.env.BASE_URL || 'http://localhost:3001';
const url = `${base.replace(/\/$/, '')}/api/health`;

async function main() {
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`Health check failed: ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  const body = await res.json();
  if (body.status !== 'ok') {
    console.error(`Health check failed: body.status !== 'ok'`, body);
    process.exit(1);
  }
  console.log('Health check OK:', body.status);
}

main().catch((err) => {
  console.error('Health check error:', err.message);
  process.exit(1);
});
