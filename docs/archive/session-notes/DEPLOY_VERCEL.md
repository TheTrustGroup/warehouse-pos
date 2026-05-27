# 🚀 Deploy to Vercel - Quick Guide

## ✅ Pre-Deployment Checklist
- ✅ Build successful
- ✅ Vercel CLI installed (v50.1.6)
- ✅ vercel.json configured
- ✅ Production build in `dist/` folder

## 🚀 Deployment Steps

### Step 1: Login to Vercel (if not logged in)
```bash
vercel login
```

### Step 2: Deploy to Production
```bash
vercel --prod
```

Or deploy with auto-confirm:
```bash
vercel --prod --yes
```

### Step 3: Follow Prompts
- **Set up and deploy?** → Yes
- **Which scope?** → Select your account/team
- **Link to existing project?** → No (for first deployment)
- **Project name?** → `warehouse-pos` (or press Enter for default)
- **Directory?** → `./` (current directory)
- **Override settings?** → No (uses vercel.json)

## 📋 Alternative: Deploy via Vercel Dashboard

1. Go to [vercel.com](https://vercel.com)
2. Click **"Add New Project"**
3. Import from GitHub:
   - Select **TheTrustGroup/warehouse-pos**
   - Vercel will auto-detect Vite settings
   - Click **"Deploy"**

## ⚙️ Vercel Configuration

Your `vercel.json` is already configured:
- ✅ Build command: `npm run build`
- ✅ Output directory: `dist`
- ✅ Framework: Vite
- ✅ SPA rewrites configured

## 🔗 After Deployment

Once deployed, you'll get:
- **Production URL**: `https://warehouse-pos.vercel.app` (or custom domain)
- **Deployment dashboard** at vercel.com
- **Automatic deployments** on every push to main branch

## 🔄 Continuous Deployment

Vercel will automatically deploy when you push to GitHub:
1. Push to `main` branch
2. Vercel detects the push
3. Builds and deploys automatically
4. You get a notification

## 📊 Deployment Status

Check deployment status:
```bash
vercel ls
```

View deployment logs:
```bash
vercel logs
```

---

**Ready to deploy!** Run `vercel --prod` when ready.
