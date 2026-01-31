#!/usr/bin/env bash
# Supabase REST seed: Category → Product → ProductVariant → ProductImage
# Usage: WRITE_TOKEN=your_service_role_key ./scripts/supabase-seed-rest.sh
# Or:   export WRITE_TOKEN=your_service_role_key && ./scripts/supabase-seed-rest.sh

set -e
BASE="https://puuszplmdbindiesfxlr.supabase.co/rest/v1"
if [ -z "$WRITE_TOKEN" ]; then
  echo "Set WRITE_TOKEN (e.g. export WRITE_TOKEN=your_service_role_key)"
  exit 1
fi

# Supabase REST requires both apikey and Authorization: Bearer
AUTH_HEADERS=(-H "Content-Type: application/json" -H "apikey: $WRITE_TOKEN" -H "Authorization: Bearer $WRITE_TOKEN")

# Upsert: merge on conflict so re-runs don't error (idempotent)
PREFER="Prefer: return=representation, resolution=merge-duplicates"

# Tables have NOT NULL updatedAt (and often createdAt) — supply them
NOW=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")

echo "1. Upsert Category..."
curl -sS -X POST "$BASE/Category" "${AUTH_HEADERS[@]}" \
  -H "$PREFER" \
  -d "[{\"id\":\"cat_default\",\"name\":\"Default\",\"slug\":\"default\",\"createdAt\":\"$NOW\",\"updatedAt\":\"$NOW\"}]"

echo -e "\n\n2. Upsert Product..."
curl -sS -X POST "$BASE/Product" "${AUTH_HEADERS[@]}" \
  -H "$PREFER" \
  -d "[{\"id\":\"prod_test_001\",\"name\":\"Test Product 1\",\"slug\":\"test-product-1\",\"description\":\"A test product created for debugging\",\"price\":1000,\"categoryId\":\"cat_default\",\"createdAt\":\"$NOW\",\"updatedAt\":\"$NOW\"}]"

echo -e "\n\n3. Verify Product (GET)..."
curl -sS -X GET "$BASE/Product?id=eq.prod_test_001" \
  -H "apikey: $WRITE_TOKEN" -H "Authorization: Bearer $WRITE_TOKEN"

echo -e "\n\n4. Upsert ProductVariant..."
curl -sS -X POST "$BASE/ProductVariant" "${AUTH_HEADERS[@]}" \
  -H "$PREFER" \
  -d "[{\"id\":\"variant_test_001\",\"productId\":\"prod_test_001\",\"size\":\"M\",\"sku\":\"SKU-TEST-001\",\"price\":1000,\"stock\":20,\"createdAt\":\"$NOW\",\"updatedAt\":\"$NOW\"}]"

echo -e "\n\n5. Upsert ProductImage..."
curl -sS -X POST "$BASE/ProductImage" "${AUTH_HEADERS[@]}" \
  -H "$PREFER" \
  -d '[{"id":"img_test_001","productId":"prod_test_001","url":"https://example.com/image.jpg","alt":"Test image","isPrimary":true,"order":0}]'

echo -e "\n\nDone."
