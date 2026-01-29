#!/bin/bash

# Quick API Connectivity Test Script
# Run this to test if your API is accessible

API_URL="https://extremedeptkidz.com/api"

echo "🔍 Testing API Connectivity..."
echo "================================"
echo ""

# Test 1: Check if API endpoint is reachable
echo "1️⃣ Testing: GET ${API_URL}/auth/user"
echo "-----------------------------------"
response=$(curl -s -o /dev/null -w "%{http_code}" "${API_URL}/auth/user" \
  -H "Accept: application/json" \
  --max-time 10)

if [ "$response" = "000" ]; then
  echo "❌ ERROR: Cannot reach API server (timeout or connection refused)"
  echo "   → Check if API server is running"
  echo "   → Verify the URL is correct: ${API_URL}"
elif [ "$response" = "401" ]; then
  echo "✅ SUCCESS: API is reachable (401 = not authenticated, which is OK)"
elif [ "$response" = "200" ]; then
  echo "✅ SUCCESS: API is reachable and authenticated"
else
  echo "⚠️  WARNING: API returned status code: $response"
fi

echo ""
echo "2️⃣ Testing: POST ${API_URL}/auth/login"
echo "-----------------------------------"
login_response=$(curl -s -w "\n%{http_code}" "${API_URL}/auth/login" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"email":"test@test.com","password":"test"}' \
  --max-time 10)

http_code=$(echo "$login_response" | tail -n1)
if [ "$http_code" = "000" ]; then
  echo "❌ ERROR: Cannot reach login endpoint"
elif [ "$http_code" = "401" ] || [ "$http_code" = "422" ]; then
  echo "✅ SUCCESS: Login endpoint is reachable (401/422 = invalid credentials, which is OK)"
else
  echo "⚠️  Response code: $http_code"
fi

echo ""
echo "================================"
echo "📋 Summary:"
echo "   - If you see ✅ SUCCESS: API is working, check CORS configuration"
echo "   - If you see ❌ ERROR: API server might be down or URL is wrong"
echo "   - Check browser console for CORS errors if API is reachable"
