#!/usr/bin/env node
/**
 * Ensures every use of requireAuth, requireAdmin, or requirePosRole in API route
 * handlers is preceded by await on the same line. Prevents auth being skipped
 * (e.g. const auth = requireAuth(req) without await).
 *
 * Usage: node scripts/check-auth-await.mjs
 * Exit: 0 if all usages have await; 1 and list violations otherwise.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.join(__dirname, '..', 'app');

const AUTH_CALLS = ['requireAuth', 'requireAdmin', 'requirePosRole'];
const AUTH_PATTERN = new RegExp(
  `\\b(${AUTH_CALLS.join('|')})\\s*\\(`
);
const AWAIT_AUTH_PATTERN = new RegExp(
  `await\\s+(${AUTH_CALLS.join('|')})\\s*\\(`
);

function* walkTsFiles(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walkTsFiles(full);
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) yield full;
  }
}

let failed = false;
for (const file of walkTsFiles(appRoot)) {
  const rel = path.relative(path.join(appRoot, '..'), file);
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const stripped = line.replace(/\/\/.*$/, '').trim();
    if (!AUTH_PATTERN.test(stripped)) continue;
    if (AWAIT_AUTH_PATTERN.test(stripped)) continue;
    console.error(`${rel}:${i + 1}: missing "await" before auth call: ${line.trim()}`);
    failed = true;
  }
}

if (failed) {
  console.error('\nFix: use "const auth = await requireAuth(request)" (or requireAdmin/requirePosRole).');
  process.exit(1);
}
