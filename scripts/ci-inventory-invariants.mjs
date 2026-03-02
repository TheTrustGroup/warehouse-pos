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
import { access, readdir, readFile } from 'node:fs/promises';

const checkEnv = process.env.CHECK_ENV === '1';

function fail(msg) {
  console.error('[INVENTORY RELIABILITY]', msg);
  process.exit(1);
}

async function fileExists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function listSqlFiles(dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.sql'))
    .map((e) => `${dirPath}/${e.name}`);
}

function stripSqlComments(sql) {
  // Best-effort comment stripping to avoid false positives from commented-out SQL.
  // Not a full SQL parser, but sufficient for our invariants.
  const withoutBlock = sql.replace(/\/\*[\s\S]*?\*\//g, '');
  return withoutBlock.replace(/^\s*--.*$/gm, '');
}

function mustNotGrantExecuteToClientRoles(sql, filePath) {
  // Reject any explicit grants to broad/client roles. (Case-insensitive.)
  const normalized = stripSqlComments(sql);
  const bad = /\bGRANT\s+EXECUTE\s+ON\s+FUNCTION\b[\s\S]*?\bTO\s+(PUBLIC|anon|authenticated)\b/gi;
  const m = normalized.match(bad);
  if (m && m.length) {
    fail(`Unsafe GRANT EXECUTE detected in ${filePath}: ${m[0].slice(0, 160)}...`);
  }
}

function mustHardenSecurityDefinerInFile(sql, filePath) {
  const normalized = stripSqlComments(sql);
  const hasSecurityDefiner = /\bSECURITY\s+DEFINER\b/i.test(normalized);
  if (!hasSecurityDefiner) return;

  const hasRevoke = /\bREVOKE\b[\s\S]*?\bON\s+FUNCTION\b/i.test(normalized);
  const hasServiceRoleGrant =
    /\bGRANT\s+EXECUTE\s+ON\s+FUNCTION\b[\s\S]*?\bTO\s+service_role\b/i.test(normalized);

  if (!hasRevoke || !hasServiceRoleGrant) {
    fail(
      `SECURITY DEFINER function(s) in ${filePath} must include explicit REVOKE ... ON FUNCTION and GRANT EXECUTE ... TO service_role (post-hardening migrations are not auto-covered).`
    );
  }
}

function mustHaveHardeningMigration(migrationFiles) {
  const hardening = migrationFiles.filter((p) =>
    p.toLowerCase().includes('harden_security_definer_executes')
  );
  if (hardening.length === 0) {
    fail(
      'Missing hardening migration: expected a file named like *harden_security_definer_executes*.sql in inventory-server/supabase/migrations/.'
    );
  }
}

async function checkSecurityDefinerHygiene() {
  const dirs = [
    `${process.cwd()}/inventory-server/supabase/migrations`,
    `${process.cwd()}/supabase/migrations`,
  ];

  const allSqlFiles = [];
  for (const dir of dirs) {
    if (await fileExists(dir)) {
      const files = await listSqlFiles(dir);
      allSqlFiles.push(...files);
    }
  }

  // Only inventory-server migrations are applied via the inventory-server workflow.
  const inventoryServerMigrations = allSqlFiles.filter((p) =>
    p.includes('/inventory-server/supabase/migrations/')
  );
  if (inventoryServerMigrations.length) {
    mustHaveHardeningMigration(inventoryServerMigrations);
  }

  // Enforce that any GRANT EXECUTE to client roles can NOT appear AFTER the hardening migration.
  // (Historical migrations may contain grants; the hardening migration must be the last word.)
  const hardening = inventoryServerMigrations
    .map((p) => p.split('/').pop())
    .filter((name) => name && name.toLowerCase().includes('harden_security_definer_executes'));
  const hardeningBase = hardening.sort().at(-1);

  if (hardeningBase) {
    for (const p of inventoryServerMigrations) {
      const base = p.split('/').pop() ?? '';
      if (base > hardeningBase) {
        const sql = await readFile(p, 'utf8');
        mustNotGrantExecuteToClientRoles(sql, p);
        mustHardenSecurityDefinerInFile(sql, p);
      }
    }
  }
}

if (checkEnv) {
  const apiBase = process.env.VITE_API_BASE_URL;
  if (!apiBase || String(apiBase).trim() === '') {
    fail('VITE_API_BASE_URL must be set when CHECK_ENV=1. No default allowed.');
  }
  console.log('[INVENTORY RELIABILITY] VITE_API_BASE_URL is set (invariant OK).');
}

await checkSecurityDefinerHygiene();

console.log('Inventory invariant checks passed.');
