-- VERIFY 4 — Storage bucket (run this alone). May be empty if no images yet.
SELECT name, created_at
FROM storage.objects
WHERE bucket_id = 'product-images'
ORDER BY created_at DESC
LIMIT 10;
