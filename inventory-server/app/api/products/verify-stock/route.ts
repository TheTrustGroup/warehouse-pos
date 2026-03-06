/**
 * POST /api/products/verify-stock — pre-sale stock check.
 * Body: { warehouse_id: string, items: [{ product_id: string, size_code?: string, quantity: number }] }
 * Returns: { valid: true } or { valid: false, conflicts: [{ product_id, size_code, requested, available }] }
 */
import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/cors';
import { requireAuth } from '@/lib/auth/session';
import { getScopeForUser } from '@/lib/data/userScopes';
import { getSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

function withCors(res: NextResponse, req: NextRequest): NextResponse {
  const h = corsHeaders(req);
  Object.entries(h).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

interface VerifyItem {
  product_id: string;
  size_code?: string;
  quantity: number;
}

interface VerifyBody {
  warehouse_id?: string;
  items?: VerifyItem[];
}

interface Conflict {
  product_id: string;
  size_code: string | null;
  requested: number;
  available: number;
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const h = corsHeaders(req);

  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return withCors(auth, req);

  let body: VerifyBody;
  try {
    body = await req.json();
  } catch {
    return withCors(
      NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: h }),
      req
    );
  }

  const warehouseId = (body.warehouse_id ?? '').trim();
  const items = Array.isArray(body.items) ? body.items : [];

  if (!warehouseId) {
    return withCors(
      NextResponse.json({ error: 'warehouse_id required' }, { status: 400, headers: h }),
      req
    );
  }

  const scope = await getScopeForUser(auth.email);
  const allowed = scope.allowedWarehouseIds;
  const roleNorm = (auth.role ?? '').toLowerCase().replace(/\s+/g, '_');
  const isAdminNoScope = (roleNorm === 'admin' || roleNorm === 'super_admin') && allowed.length === 0;
  if (!isAdminNoScope && !allowed.includes(warehouseId)) {
    return withCors(
      NextResponse.json({ error: 'Warehouse not in scope' }, { status: 403, headers: h }),
      req
    );
  }

  if (items.length === 0) {
    return withCors(
      NextResponse.json({ valid: true }, { status: 200, headers: h }),
      req
    );
  }

  const supabase = getSupabase();
  const conflicts: Conflict[] = [];

  for (const item of items) {
    const productId = (item.product_id ?? '').trim();
    const sizeCode = item.size_code != null ? String(item.size_code).trim() || null : null;
    const requested = Math.max(0, Number(item.quantity) || 0);
    if (!productId || requested === 0) continue;

    let available = 0;

    if (sizeCode) {
      const { data: rows } = await supabase
        .from('warehouse_inventory_by_size')
        .select('quantity')
        .eq('warehouse_id', warehouseId)
        .eq('product_id', productId)
        .eq('size_code', sizeCode)
        .limit(1);
      const qty = rows?.[0]?.quantity;
      available = typeof qty === 'number' ? qty : Number(qty) || 0;
    } else {
      const { data: rows } = await supabase
        .from('warehouse_inventory_by_size')
        .select('quantity')
        .eq('warehouse_id', warehouseId)
        .eq('product_id', productId);
      available = Array.isArray(rows)
        ? rows.reduce((sum, r) => sum + (Number(r?.quantity) || 0), 0)
        : 0;
    }

    if (requested > available) {
      conflicts.push({
        product_id: productId,
        size_code: sizeCode ?? null,
        requested,
        available,
      });
    }
  }

  if (conflicts.length > 0) {
    return withCors(
      NextResponse.json({ valid: false, conflicts }, { status: 200, headers: h }),
      req
    );
  }

  return withCors(
    NextResponse.json({ valid: true }, { status: 200, headers: h }),
    req
  );
}
