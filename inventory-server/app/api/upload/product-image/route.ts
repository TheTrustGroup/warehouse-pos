/**
 * POST /api/upload/product-image
 * Multipart form with "file" or "image". Uploads to Supabase Storage bucket "product-images".
 * Returns { url: string } (public URL). Auth required.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getSupabase } from '@/lib/supabase';

const BUCKET = 'product-images';
const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth as NextResponse;

  let file: File | null;
  try {
    const formData = await request.formData();
    file = (formData.get('file') ?? formData.get('image')) as File | null;
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'Missing file. Send multipart form with field "file" or "image".' },
        { status: 400 }
      );
    }
  } catch {
    return NextResponse.json({ error: 'Invalid multipart body' }, { status: 400 });
  }

  if (!file) {
    return NextResponse.json(
      { error: 'Missing file. Send multipart form with field "file" or "image".' },
      { status: 400 }
    );
  }

  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json(
      { error: `File too large. Max ${MAX_SIZE_BYTES / 1024 / 1024}MB.` },
      { status: 400 }
    );
  }
  const type = file.type?.toLowerCase() ?? '';
  if (!ALLOWED_TYPES.some((t) => type === t)) {
    return NextResponse.json(
      { error: `Unsupported type. Allowed: ${ALLOWED_TYPES.join(', ')}.` },
      { status: 400 }
    );
  }

  const ext = type === 'image/jpeg' ? 'jpg' : type.split('/')[1] ?? 'bin';
  const path = `${crypto.randomUUID()}.${ext}`;

  try {
    const supabase = getSupabase();
    const buf = await file.arrayBuffer();
    const { error } = await supabase.storage.from(BUCKET).upload(path, buf, {
      contentType: file.type,
      upsert: false,
    });
    if (error) {
      console.error('[upload/product-image]', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return NextResponse.json({ url: publicUrlData.publicUrl });
  } catch (e) {
    console.error('[upload/product-image]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Upload failed' },
      { status: 500 }
    );
  }
}
