#!/bin/bash
# Secure Push Script - Uses environment variable or prompts for token

cd "/Users/raregem.zillion/Desktop/World-Class Warehouse Inventory & Smart POS System/warehouse-pos"

echo "🚀 Pushing to GitHub..."
echo ""

# Check if token is in environment variable
if [ -z "$GITHUB_TOKEN" ]; then
    echo "⚠️  GITHUB_TOKEN environment variable not set."
    echo ""
    echo "Option 1: Set environment variable (recommended):"
    echo "  export GITHUB_TOKEN=your_token_here"
    echo "  ./push_with_token.sh"
    echo ""
    echo "Option 2: Use credential helper (best for long-term):"
    echo "  git config --global credential.helper osxkeychain"
    echo "  git push -u origin main"
    echo ""
    echo "Option 3: Use GitHub CLI:"
    echo "  gh auth login"
    echo "  git push -u origin main"
    echo ""
    read -sp "Or enter token now (will not be stored): " TOKEN
    echo ""
else
    TOKEN="$GITHUB_TOKEN"
fi

if [ -n "$TOKEN" ]; then
    # Push using token in URL (temporary, not stored)
    git push https://${TOKEN}@github.com/TheTrustGroup/warehouse-pos.git main
    echo ""
    echo "✅ Push complete!"
else
    echo "❌ No token provided. Exiting."
    exit 1
fi

echo ""
echo "💡 TIP: Set up credential helper for future pushes:"
echo "   git config --global credential.helper osxkeychain"
