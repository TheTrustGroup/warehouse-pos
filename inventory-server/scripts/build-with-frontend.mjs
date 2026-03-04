#!/usr/bin/env node
/**
 * Build the Vite frontend (from repo root) with same-origin API, then copy dist
 * into inventory-server/public so Next.js can serve the SPA. Used for single
 * Vercel project (frontend + API). Run from inventory-server directory.
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(serverRoot, '..');
const distDir = path.join(repoRoot, 'dist');
const publicDir = path.join(serverRoot, 'public');

if (!fs.existsSync(path.join(repoRoot, 'package.json'))) {
  console.error('[build-with-frontend] Repo root not found at', repoRoot);
  process.exit(1);
}

console.log('[build-with-frontend] Building Vite app at', repoRoot, 'with VITE_API_BASE_URL=""');
// Install devDependencies too (Vite is devDep); Vercel sets NODE_ENV=production so npm ci would omit them
const installEnv = { ...process.env, NODE_ENV: 'development' };
execSync('npm ci', { cwd: repoRoot, stdio: 'inherit', env: installEnv });
// npx so vite is found from node_modules; skip tsc (avoids vitest/import.meta.env types in Vercel)
execSync('npx vite build', {
  cwd: repoRoot,
  stdio: 'inherit',
  env: { ...process.env, VITE_API_BASE_URL: '' },
});

if (!fs.existsSync(distDir)) {
  console.error('[build-with-frontend] dist/ not found after build');
  process.exit(1);
}

if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      copyRecursive(path.join(src, name), path.join(dest, name));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

console.log('[build-with-frontend] Copying dist to public/');
for (const name of fs.readdirSync(distDir)) {
  copyRecursive(path.join(distDir, name), path.join(publicDir, name));
}
console.log('[build-with-frontend] Done. Run next build.');
