#!/usr/bin/env node
/**
 * Exit 1 if there are uncommitted or untracked files in the repo.
 * Use before end of day or in CI to avoid leaving work uncommitted.
 * Run from warehouse-pos root: node scripts/guard-uncommitted.mjs
 */
import { execSync } from 'child_process';

try {
  const out = execSync('git status --porcelain', { encoding: 'utf8' });
  const lines = out.trim() ? out.trim().split('\n') : [];
  if (lines.length > 0) {
    console.error('[guard:uncommitted] You have uncommitted or untracked files. Commit and push before leaving.');
    console.error(out);
    process.exit(1);
  }
  console.log('[guard:uncommitted] Clean — no uncommitted changes.');
} catch (e) {
  console.error('[guard:uncommitted] Failed to run git status:', e.message);
  process.exit(1);
}
