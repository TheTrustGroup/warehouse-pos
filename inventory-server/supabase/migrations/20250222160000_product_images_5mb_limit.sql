-- Raise product-images bucket file_size_limit from 2MB to 5MB.
-- Client (imageUpload.ts) and API (upload/product-image/route.ts) use the same limit.
UPDATE storage.buckets
SET file_size_limit = 5242880
WHERE id = 'product-images';
