#!/bin/bash
# Deploy to Vercel Script

cd "/Users/raregem.zillion/Desktop/World-Class Warehouse Inventory & Smart POS System/warehouse-pos"

echo "🚀 Deploying to Vercel..."
echo ""

# Check if logged in
if ! vercel whoami &>/dev/null; then
    echo "⚠️  Not logged in to Vercel"
    echo "Please run: vercel login"
    exit 1
fi

# Build first
echo "📦 Building project..."
npm run build

# Deploy
echo ""
echo "🚀 Deploying to production..."
vercel --prod --yes

echo ""
echo "✅ Deployment complete!"
