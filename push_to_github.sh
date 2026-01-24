#!/bin/bash
# Push to GitHub Script

echo "🚀 Pushing to GitHub..."
echo ""

# Get current directory
cd "/Users/raregem.zillion/Desktop/World-Class Warehouse Inventory & Smart POS System/warehouse-pos"

# Check if remote exists
if git remote get-url origin &>/dev/null; then
    echo "✅ Remote 'origin' already configured:"
    git remote -v
    echo ""
    read -p "Push to existing remote? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        git push -u origin main
    else
        echo "Skipped. To add a new remote, run:"
        echo "  git remote set-url origin https://github.com/YOUR_USERNAME/warehouse-pos.git"
    fi
else
    echo "❌ No remote configured."
    echo ""
    echo "To push to GitHub, you need to:"
    echo ""
    echo "1. Create a repository on GitHub.com"
    echo "2. Then run:"
    echo ""
    echo "   git remote add origin https://github.com/YOUR_USERNAME/warehouse-pos.git"
    echo "   git push -u origin main"
    echo ""
    echo "Or use GitHub CLI:"
    echo "   gh repo create warehouse-pos --private --source=. --remote=origin --push"
    echo ""
    read -p "Do you want to use GitHub CLI to create and push? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        if command -v gh &> /dev/null; then
            gh repo create warehouse-pos --private --source=. --remote=origin --push
        else
            echo "GitHub CLI not installed. Install with: brew install gh"
        fi
    fi
fi
