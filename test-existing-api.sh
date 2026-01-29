#!/bin/bash

# Test script to discover existing store admin API endpoints

BASE_URL="https://extremedeptkidz.com"

echo "🔍 Testing Existing Store Admin API..."
echo "======================================"
echo ""
echo "Testing common admin API patterns..."
echo ""

# Common API path patterns
declare -a api_patterns=(
  "/api"
  "/api/products"
  "/api/auth/user"
  "/api/auth/login"
  "/admin/api"
  "/admin/api/products"
  "/admin/api/auth/user"
  "/dashboard/api"
  "/dashboard/api/products"
  "/api/v1"
  "/api/v1/products"
  "/api/v1/auth/user"
  "/wp-json/wp/v2"
  "/api/admin"
  "/api/admin/products"
)

echo "📋 Testing API Endpoints:"
echo "-------------------------"

for pattern in "${api_patterns[@]}"; do
  status=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}${pattern}" \
    -H "Accept: application/json" \
    --max-time 5 2>/dev/null)
  
  if [ "$status" != "000" ] && [ "$status" != "404" ]; then
    echo "✅ ${pattern} → Status: $status"
    
    # Try to get a sample response
    if [ "$status" = "200" ] || [ "$status" = "401" ] || [ "$status" = "403" ]; then
      response=$(curl -s "${BASE_URL}${pattern}" --max-time 5 2>/dev/null | head -c 200)
      if [ ! -z "$response" ]; then
        echo "   Preview: ${response:0:100}..."
      fi
    fi
  fi
done

echo ""
echo "📋 Testing Authentication Endpoints:"
echo "-----------------------------------"

declare -a auth_patterns=(
  "/api/auth/login"
  "/api/login"
  "/admin/api/login"
  "/api/v1/auth/login"
  "/auth/login"
  "/wp-json/jwt-auth/v1/token"
)

for pattern in "${auth_patterns[@]}"; do
  status=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}${pattern}" \
    -X POST \
    -H "Content-Type: application/json" \
    -d '{"test":"test"}' \
    --max-time 5 2>/dev/null)
  
  if [ "$status" != "000" ] && [ "$status" != "404" ] && [ "$status" != "405" ]; then
    echo "✅ POST ${pattern} → Status: $status"
  fi
done

echo ""
echo "======================================"
echo "💡 Instructions:"
echo "   1. Log into your admin panel"
echo "   2. Open browser DevTools (F12)"
echo "   3. Go to Network tab"
echo "   4. Perform actions (view products, etc.)"
echo "   5. Look at the API calls being made"
echo "   6. Share the API endpoint URLs with us"
