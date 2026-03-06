-- RLS policies for Supabase Storage bucket 'product-images'.
-- Create the bucket in Dashboard → Storage → New bucket, name: product-images, public.
-- Then run this migration so authenticated users can upload and everyone can read.

-- Allow public read for product images (product list, POS, receipts).
CREATE POLICY "Product images are public"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-images');

-- Allow authenticated users to upload to product-images (any path).
CREATE POLICY "Authenticated users can upload product images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'product-images');

-- Allow authenticated users to update/delete (e.g. replace or remove image).
CREATE POLICY "Authenticated users can update product images"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'product-images');

CREATE POLICY "Authenticated users can delete product images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'product-images');
