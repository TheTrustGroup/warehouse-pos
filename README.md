# 🎨 Extreme Dept Kidz - Premium Warehouse & POS System

A world-class, premium Figma-inspired warehouse inventory and point-of-sale system with glass morphism design.

## ✨ Features

- **Premium Glass Morphism UI** - Beautiful frosted glass effects throughout
- **Figma-Inspired Design** - Professional, modern interface
- **Perfect Alignment** - Pixel-perfect spacing and typography
- **Smooth Animations** - Butter-smooth transitions on all interactions
- **Responsive Design** - Works beautifully on all screen sizes
- **Inventory Management** - Complete product management system
- **Point of Sale** - Full-featured POS with multiple payment methods
- **Reports & Analytics** - Comprehensive business insights
- **User Management** - Complete user and settings management

## 🚀 Quick Start

### Development
```bash
npm install
npm run dev
```

### Build
```bash
npm run build
```

### Preview Production Build
```bash
npm run preview
```

## 🎨 Design System

### Glass Morphism
All cards use the `glass-card` class for premium glass morphism effects:
```tsx
<div className="glass-card">
  {/* Your content */}
</div>
```

### Premium Buttons
```tsx
<button className="btn-primary">Primary Action</button>
<button className="btn-secondary">Secondary Action</button>
```

### Input Fields
```tsx
<input className="input-field" placeholder="Enter value..." />
```

### Status Badges
```tsx
<span className="badge badge-success">In Stock</span>
<span className="badge badge-warning">Low Stock</span>
<span className="badge badge-error">Out of Stock</span>
```

## 📦 Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions.

### Quick Deploy Options:

**Vercel:**
```bash
npm i -g vercel
vercel
```

**Netlify:**
```bash
npm i -g netlify-cli
netlify deploy --prod --dir=dist
```

## 🛠️ Tech Stack

- **React 18** - UI Framework
- **TypeScript** - Type Safety
- **Vite** - Build Tool
- **Tailwind CSS** - Styling
- **React Router** - Navigation
- **Recharts** - Data Visualization
- **Lucide React** - Icons

## 📝 Commit Changes

Run the commit script:
```bash
./commit.sh
```

Or manually:
```bash
git add .
git commit -m "Your commit message"
```

## 🎯 Project Structure

```
src/
├── components/     # Reusable UI components
├── pages/          # Page components
├── contexts/       # React contexts
├── services/       # Business logic
├── types/          # TypeScript types
└── lib/            # Utility functions
```

## 📄 License

Private - All rights reserved

---

**Status**: ✅ Production Ready | 🎨 Premium UI | 🚀 Ready to Deploy
