#!/bin/bash
# Git Commit Script for Premium UI Redesign

echo "🎨 Committing Premium UI Redesign..."

# Initialize git if needed
if [ ! -d ".git" ]; then
    echo "Initializing git repository..."
    git init
fi

# Add all changes
git add .

# Commit with descriptive message
git commit -m "feat: Implement premium Figma-inspired glass morphism UI redesign

✨ Features:
- Premium glass morphism design throughout
- Figma-inspired styling with perfect alignment
- Smooth animations and transitions
- Professional typography (Inter font)
- Consistent 8px grid spacing system
- Enhanced responsive design

🎨 Design System:
- Updated Tailwind config with premium tokens
- Glass morphism cards and containers
- Premium button styles (primary/secondary)
- Enhanced input fields with focus states
- Status badges with proper colors
- Premium table styling

🐛 Fixes:
- Fixed TypeScript errors and warnings
- Fixed JSX syntax errors
- Fixed CSS import order
- Removed unused imports

📦 Build:
- Production build successful
- All components updated
- Ready for deployment"

echo "✅ Commit completed!"
echo ""
echo "To push to remote (if configured):"
echo "  git remote add origin <your-repo-url>"
echo "  git push -u origin main"
