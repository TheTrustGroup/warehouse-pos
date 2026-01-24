#!/bin/bash
# Trigger Vercel Deployment Script

cd "/Users/raregem.zillion/Desktop/World-Class Warehouse Inventory & Smart POS System/warehouse-pos"

echo "🚀 Triggering Vercel Deployment..."
echo ""

# Build first
echo "📦 Building project..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed. Aborting deployment."
    exit 1
fi

echo ""
echo "🚀 Deploying to production..."

# Try deployment with force flag
vercel --prod --force

echo ""
echo "✅ Deployment triggered!"
echo ""
echo "Check status with: vercel ls"
echo "View dashboard: https://vercel.com/dashboard"
