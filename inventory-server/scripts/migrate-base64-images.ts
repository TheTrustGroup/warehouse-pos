/**
 * One-time migration: move product images from base64 in DB to Supabase Storage.
 * Run from inventory-server: npm run migrate:base64-images [-- --dry-run]
 * Or from repo root: npm run migrate:base64-images -- [--dry-run]
 *
 * Env: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.
 * If not in the shell, the script loads them from .env.migration or .env.local
 * in the current working directory (create one with your production values for local runs).
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let projectRoot = process.cwd();
try {
  if (typeof import.meta !== 'undefined' && import.meta.url) {
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    projectRoot = path.join(scriptDir, '..');
  }
} catch {
  // use cwd only
}

function loadEnvFromFile(): void {
  const searchDirs = [projectRoot, process.cwd()];
  const tried: string[] = [];
  for (const dir of searchDirs) {
    for (const name of ['.env.migration', '.env.local', '.env']) {
      const file = path.join(dir, name);
      tried.push(file);
      try {
        if (!fs.existsSync(file)) continue;
        const raw = fs.readFileSync(file, 'utf8');
        for (const line of raw.split('\n')) {
          const trimmed = line.replace(/#.*$/, '').trim();
          if (!trimmed) continue;
          const eq = trimmed.indexOf('=');
          if (eq <= 0) continue;
          const key = trimmed.slice(0, eq).trim();
          let val = trimmed.slice(eq + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
            val = val.slice(1, -1);
          if (key) process.env[key] = val;
        }
        return;
      } catch {
        // continue to next file
      }
    }
  }
  if (!process.env.SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Env not found. Checked:', tried.filter((f, i) => tried.indexOf(f) === i).join(', '));
  }
}

loadEnvFromFile();

function getSupabaseFromEnv(): SupabaseClient {
  const url =
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';
  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY are required. Set them in .env.migration (inventory-server/) or in the environment.'
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false },
    db: { schema: 'public' as const },
  });
}

const BUCKET = 'product-images';
const PAGE_SIZE = 100;

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

function getExtFromDataUrl(dataUrl: string): string {
  const match = dataUrl.match(/^data:([^;]+);/);
  const mime = (match?.[1] ?? '').toLowerCase().trim();
  return MIME_EXT[mime] ?? 'jpg';
}

function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; contentType: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('Invalid data URL');
  const contentType = match[1].trim().toLowerCase();
  const base64 = match[2];
  if (!base64) throw new Error('Empty base64 in data URL');
  const buffer = Buffer.from(base64, 'base64');
  return { buffer, contentType };
}

function hasBase64Image(images: unknown): boolean {
  if (!Array.isArray(images)) return false;
  return images.some(
    (img): img is string => typeof img === 'string' && img.startsWith('data:image/')
  );
}

async function getWarehouseIdForProduct(
  supabase: SupabaseClient,
  productId: string
): Promise<string> {
  const { data } = await supabase
    .from('warehouse_inventory')
    .select('warehouse_id')
    .eq('product_id', productId)
    .limit(1);
  const row = Array.isArray(data) ? data[0] : null;
  const id = (row as { warehouse_id?: string } | null)?.warehouse_id;
  return id ?? 'shared';
}

async function migrateProduct(
  supabase: SupabaseClient,
  productId: string,
  images: string[],
  dryRun: boolean
): Promise<void> {
  const warehouseId = await getWarehouseIdForProduct(supabase, productId);
  const newImages: string[] = [];

  for (let i = 0; i < images.length; i++) {
    const raw = images[i];
    if (typeof raw !== 'string') {
      newImages.push('');
      continue;
    }

    if (!raw.startsWith('data:image/')) {
      newImages.push(raw);
      continue;
    }

    const oldSize = raw.length;
    try {
      const { buffer, contentType } = dataUrlToBuffer(raw);
      const ext = getExtFromDataUrl(raw);
      const path = `${warehouseId}/${productId}/${i}.${ext}`;

      if (dryRun) {
        console.log(
          `  [dry-run] would upload ${path} (${oldSize} chars) -> product-images bucket`
        );
        newImages.push(`[dry-run:${path}]`);
        continue;
      }

      const { data, error } = await supabase.storage
        .from(BUCKET)
        .upload(path, buffer, {
          contentType: contentType || 'image/jpeg',
          upsert: true,
        });

      if (error) {
        console.error(`  [ERROR] upload failed for ${path}: ${error.message}`);
        newImages.push(raw);
        continue;
      }

      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(data.path);
      const publicUrl = urlData.publicUrl;
      newImages.push(publicUrl);
      console.log(`  product ${productId} image ${i}: ${oldSize} chars -> ${publicUrl}`);
    } catch (e) {
      console.error(`  [ERROR] product ${productId} image ${i}:`, e);
      newImages.push(raw);
    }
  }

  if (dryRun) {
    console.log(`  [dry-run] would update product ${productId} images (${images.length} items)`);
    return;
  }

  const { error } = await supabase
    .from('warehouse_products')
    .update({ images: newImages })
    .eq('id', productId);

  if (error) {
    console.error(`  [ERROR] failed to update product ${productId}:`, error.message);
    throw error;
  }
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  if (dryRun) {
    console.log('DRY RUN — no uploads or DB updates will be performed.\n');
  }

  // Load .env.migration: script-relative path first (inventory-server/.env.migration), then cwd
  const envPaths = [
    path.join(projectRoot, '.env.migration'),
    path.join(process.cwd(), '.env.migration'),
  ];
  let foundRequired = false;
  for (const envPath of envPaths) {
    if (!fs.existsSync(envPath)) continue;
    const raw = fs.readFileSync(envPath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.replace(/#.*$/, '').trim();
      if (!trimmed) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
        val = val.slice(1, -1);
      if (key) process.env[key] = val;
    }
    if (process.env.SUPABASE_SERVICE_ROLE_KEY && (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)) {
      foundRequired = true;
      break;
    }
  }
  if (!foundRequired) {
    console.error(
      'Could not load SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.migration.\n' +
        '  Tried: ' +
        envPaths.join(', ') +
        '\n  Ensure inventory-server/.env.migration has two lines (no quotes):\n' +
        '    SUPABASE_URL=https://your-project.supabase.co\n' +
        '    SUPABASE_SERVICE_ROLE_KEY=your-service-role-key'
    );
  }

  const supabase = getSupabaseFromEnv();
  let offset = 0;
  let totalProcessed = 0;
  let totalErrors = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data: rows, error } = await supabase
      .from('warehouse_products')
      .select('id, images')
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error('Failed to fetch products:', error.message);
      process.exit(1);
    }

    const list = (rows ?? []) as { id: string; images: unknown }[];
    if (list.length === 0) break;

    for (const row of list) {
      const images = Array.isArray(row.images) ? (row.images as string[]) : [];
      if (!hasBase64Image(images)) continue;

      try {
        console.log(`Processing product ${row.id} (${images.length} images)...`);
        await migrateProduct(supabase, row.id, images, dryRun);
        totalProcessed++;
      } catch (err) {
        totalErrors++;
        console.error(`Product ${row.id} failed:`, err);
      }
    }

    offset += PAGE_SIZE;
    if (list.length < PAGE_SIZE) break;
  }

  console.log(
    `\nDone. Products migrated: ${totalProcessed}. Errors: ${totalErrors}.${dryRun ? ' (dry-run)' : ''}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
