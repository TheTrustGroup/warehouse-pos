#!/usr/bin/env node
/**
 * Analyze Supabase + Vercel wiring by calling the inventory-server health endpoint.
 * Usage:
 *   node scripts/analyze-supabase-vercel.mjs
 *   API_BASE_URL=https://your-api.vercel.app node scripts/analyze-supabase-vercel.mjs
 *
 * Exits 0 if all checks pass, 1 otherwise.
 */

const baseUrl = process.env.API_BASE_URL || process.env.BASE_URL || 'http://localhost:3001';
const base = baseUrl.replace(/\/$/, '');

async function fetchJson(path) {
  const url = `${base}${path}`;
  const res = await fetch(url, { method: 'GET' });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: res.ok, status: res.status, error: text || res.statusText };
  }
  return { ok: res.ok, status: res.status, data };
}

function pass(label, value) {
  console.log(`  \u2713 ${label}: ${value}`);
}
function fail(label, value) {
  console.log(`  \u2717 ${label}: ${value}`);
}

let exitCode = 0;

console.log(`\nAnalyzing: ${base}\n`);

// 1. Basic health
const health = await fetchJson('/api/health');
if (!health.ok) {
  fail('Health', `HTTP ${health.status}`);
  if (health.error) console.log(`     ${health.error}`);
  exitCode = 1;
} else if (health.data?.status !== 'ok') {
  fail('Health', `status = ${health.data?.status ?? 'missing'}`);
  exitCode = 1;
} else {
  pass('Health', 'ok');
}

// 2. Env (optional)
const healthEnv = await fetchJson('/api/health?env=1');
if (healthEnv.ok && healthEnv.data?.env) {
  const e = healthEnv.data.env;
  if (e.supabaseUrl) pass('Env SUPABASE_URL', 'set');
  else {
    fail('Env SUPABASE_URL', 'missing');
    exitCode = 1;
  }
  if (e.serviceRoleKey) pass('Env SUPABASE_SERVICE_ROLE_KEY', 'set');
  else {
    fail('Env SUPABASE_SERVICE_ROLE_KEY', 'missing');
    exitCode = 1;
  }
} else if (!health.ok) {
  console.log('  (skipping env check: health failed)');
} else {
  console.log('  (env check: no env in response)');
}

// 3. DB (optional)
const healthDb = await fetchJson('/api/health?db=1');
if (healthDb.ok && healthDb.data?.db) {
  if (healthDb.data.db.ok) pass('Supabase DB', 'reachable');
  else {
    fail('Supabase DB', healthDb.data.db.error || 'not ok');
    exitCode = 1;
  }
} else if (!health.ok) {
  console.log('  (skipping DB check: health failed)');
} else {
  console.log('  (DB check: no db in response)');
}

console.log('');
process.exit(exitCode);
