#!/bin/bash
# Test CORS and login endpoint for warehouse.extremedeptkidz.com
# Run: ./test-cors-and-login.sh

BASE="https://extremedeptkidz.com"
ORIGIN="https://warehouse.extremedeptkidz.com"

echo "=========================================="
echo "1. Testing OPTIONS (CORS preflight)"
echo "=========================================="
curl -s -X OPTIONS "${BASE}/admin/api/login" \
  -H "Origin: ${ORIGIN}" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type, Accept" \
  -D - -o /dev/null | grep -i "access-control"

echo ""
echo "=========================================="
echo "2. Testing POST login (expect 401/422 if endpoint exists)"
echo "=========================================="
HTTP_CODE=$(curl -s -o /tmp/login_response.txt -w "%{http_code}" \
  -X POST "${BASE}/admin/api/login" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "Origin: ${ORIGIN}" \
  -d '{"email":"test@test.com","password":"test"}' \
  --max-time 10)

echo "HTTP Status: ${HTTP_CODE}"
if [ -f /tmp/login_response.txt ]; then
  echo "Response body (first 200 chars):"
  head -c 200 /tmp/login_response.txt
  echo ""
fi

echo ""
echo "=========================================="
echo "Summary"
echo "=========================================="
if [ "$HTTP_CODE" = "000" ]; then
  echo "FAIL: Could not reach server (timeout or connection refused)"
elif [ "$HTTP_CODE" = "404" ]; then
  echo "WARN: Endpoint not found (404). Login URL may be different."
else
  echo "OK: Server responded with ${HTTP_CODE}"
fi
echo "Check that CORS headers above include:"
echo "  Access-Control-Allow-Origin: ${ORIGIN}"
echo "  Access-Control-Allow-Credentials: true"
