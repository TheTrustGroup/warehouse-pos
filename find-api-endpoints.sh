#!/bin/bash

# API Endpoint Discovery Script
# This script tests various API path structures to find the correct endpoints

BASE_URL="https://extremedeptkidz.com"

echo "🔍 Discovering API Endpoint Structure..."
echo "========================================"
echo ""
echo "Testing different path combinations..."
echo ""

# Test patterns
declare -a patterns=(
  "/api/auth/user"
  "/api/auth/login"
  "/auth/user"
  "/auth/login"
  "/api/user"
  "/api/login"
  "/user"
  "/login"
  "/api/v1/auth/user"
  "/api/v1/auth/login"
  "/v1/auth/user"
  "/v1/auth/login"
)

echo "📋 Testing GET endpoints:"
echo "-----------------------"
for pattern in "${patterns[@]}"; do
  if [[ "$pattern" == *"login"* ]]; then
    continue  # Skip login for GET test
  fi
  
  status=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}${pattern}" \
    -H "Accept: application/json" \
    --max-time 5 2>/dev/null)
  
  if [ "$status" != "000" ] && [ "$status" != "404" ]; then
    echo "✅ GET ${pattern} → Status: $status"
  fi
done

echo ""
echo "📋 Testing POST endpoints:"
echo "------------------------"
for pattern in "${patterns[@]}"; do
  if [[ "$pattern" != *"login"* ]]; then
    continue  # Only test login endpoints for POST
  fi
  
  status=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}${pattern}" \
    -X POST \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    -d '{"email":"test","password":"test"}' \
    --max-time 5 2>/dev/null)
  
  if [ "$status" != "000" ] && [ "$status" != "404" ] && [ "$status" != "405" ]; then
    echo "✅ POST ${pattern} → Status: $status"
  fi
done

echo ""
echo "📋 Testing API root paths:"
echo "-------------------------"
declare -a root_paths=(
  "/api"
  "/api/v1"
  "/v1"
  "/"
)

for path in "${root_paths[@]}"; do
  status=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}${path}" \
    --max-time 5 2>/dev/null)
  
  if [ "$status" != "000" ] && [ "$status" != "404" ]; then
    echo "✅ ${path} → Status: $status"
    # Try to get response body for more info
    response=$(curl -s "${BASE_URL}${path}" --max-time 5 2>/dev/null | head -c 200)
    if [ ! -z "$response" ]; then
      echo "   Response preview: ${response:0:100}..."
    fi
  fi
done

echo ""
echo "========================================"
echo "💡 Next Steps:"
echo "   1. Look for ✅ responses above"
echo "   2. Check if your backend API documentation lists the endpoints"
echo "   3. Contact your backend developer for the correct API structure"
echo "   4. Update the code to match the actual API endpoints"
