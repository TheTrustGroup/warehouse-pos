#!/bin/bash
# Fix Git Permissions Script

echo "🔧 Fixing Git Permissions..."

cd "/Users/raregem.zillion/Desktop/World-Class Warehouse Inventory & Smart POS System/warehouse-pos"

# Remove incomplete .git if exists
if [ -d ".git" ]; then
    echo "Removing incomplete .git directory..."
    rm -rf .git
fi

# Fix permissions
echo "Fixing directory permissions..."
chmod -R u+w .

# Try to initialize git
echo "Initializing git repository..."
if git init; then
    echo "✅ Git initialized successfully!"
    
    # Configure git
    git config user.name "Extreme Dept Kidz"
    git config user.email "dev@extremedeptkidz.com"
    
    # Add files
    echo "Adding files..."
    git add .
    
    # Commit
    echo "Committing changes..."
    git commit -m "feat: Premium Figma-inspired glass morphism UI redesign

✨ Features:
- Premium glass morphism design throughout
- Figma-inspired styling with perfect alignment
- Smooth animations and transitions
- Professional typography (Inter font)
- Consistent 8px grid spacing system

🎨 Design System:
- Updated Tailwind config with premium tokens
- Glass morphism cards and containers
- Premium button styles
- Enhanced input fields
- Status badges
- Premium table styling

🐛 Fixes:
- Fixed TypeScript errors
- Fixed JSX syntax errors
- Fixed CSS import order
- Removed unused imports

📦 Build:
- Production build successful
- Ready for deployment"
    
    echo ""
    echo "✅ Success! Git repository initialized and committed."
    echo ""
    echo "To push to remote:"
    echo "  git remote add origin <your-repo-url>"
    echo "  git push -u origin main"
else
    echo "❌ Git initialization failed. Permission issue detected."
    echo ""
    echo "Please try one of these solutions:"
    echo "1. Run: sudo chown -R \$(whoami):staff ."
    echo "2. Grant Full Disk Access to Terminal in System Settings"
    echo "3. Move project to Documents folder"
    echo "4. Use GitHub Desktop or VS Code Git instead"
    echo ""
    echo "See FIX_PERMISSIONS.md for detailed solutions."
fi
