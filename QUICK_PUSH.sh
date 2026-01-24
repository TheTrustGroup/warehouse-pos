#!/bin/bash
# Quick Push to GitHub Script

echo "🚀 Quick Push to GitHub"
echo ""

cd "/Users/raregem.zillion/Desktop/World-Class Warehouse Inventory & Smart POS System/warehouse-pos"

# Check if remote exists
if git remote get-url origin &>/dev/null; then
    REMOTE_URL=$(git remote get-url origin)
    echo "✅ Remote configured: $REMOTE_URL"
    echo ""
    echo "📤 Pushing commits..."
    git push -u origin main
    echo ""
    echo "✅ Done! Check your repository on GitHub."
else
    echo "❌ No remote configured yet."
    echo ""
    echo "To connect and push:"
    echo ""
    echo "1. Create repository on GitHub.com"
    echo "2. Then run:"
    echo ""
    echo "   git remote add origin https://github.com/YOUR_USERNAME/warehouse-pos.git"
    echo "   git push -u origin main"
    echo ""
    echo "Or use GitHub CLI:"
    echo "   gh repo create warehouse-pos --private --source=. --remote=origin --push"
fi
