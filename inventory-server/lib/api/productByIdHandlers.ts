import { NextRequest, NextResponse } from 'next/server';
import { getProductById } from '@/lib/data/warehouseProducts';
import type { Session } from '@/lib/auth/session';
import type { PutProductBody } from '@/lib/data/warehouseProducts';

/** GET one product by query id + warehouse_id. Returns 200 with product (includes images) or 404. */
export async function handleGetProductById(
  productId: string,
  warehouseId: string
): Promise<NextResponse> {
  const product = await getProductById(warehouseId, productId);
  if (!product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 });
  }
  return NextResponse.json(product);
}

/** PUT one product. Stub: use PATCH /api/products/:id for updates. */
export async function handlePutProductById(
  _request: NextRequest,
  _id: string,
  _body: PutProductBody,
  _warehouseId: string,
  _auth: Session
): Promise<NextResponse> {
  return NextResponse.json(
    { error: 'Use PATCH /api/products/:id with request body for updates' },
    { status: 501 }
  );
}

/** DELETE one product. Stub: use DELETE /api/products/:id. */
export async function handleDeleteProductById(
  _request: NextRequest,
  _id: string,
  _warehouseId: string,
  _auth: Session
): Promise<NextResponse> {
  return NextResponse.json(
    { error: 'Use DELETE /api/products/:id for deletes' },
    { status: 501 }
  );
}
