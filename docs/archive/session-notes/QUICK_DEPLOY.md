# ⚡ Quick Deploy to Vercel

## 🚀 Fastest Method: Vercel Dashboard

1. **Go to**: [vercel.com/new](https://vercel.com/new)
2. **Import Git Repository**:
   - Click "Import Git Repository"
   - Select **TheTrustGroup/warehouse-pos**
   - Click "Import"
3. **Configure** (auto-detected):
   - Framework Preset: **Vite** ✅
   - Build Command: `npm run build` ✅
   - Output Directory: `dist` ✅
   - Install Command: `npm install` ✅
4. **Deploy**:
   - Click "Deploy"
   - Wait ~2 minutes
   - Get your live URL! 🎉

## 💻 Command Line Method

### If not logged in:
```bash
vercel login
```

### Deploy:
```bash
cd warehouse-pos
vercel --prod
```

Follow the prompts:
- Set up and deploy? → **Yes**
- Link to existing? → **No** (first time)
- Project name? → **warehouse-pos** (or Enter)
- Directory? → **./** (Enter)

## ✅ Your Configuration

Already set up in `vercel.json`:
- ✅ Build: `npm run build`
- ✅ Output: `dist`
- ✅ Framework: Vite
- ✅ SPA routing configured

## 🔗 After Deployment

You'll get:
- **Production URL**: `https://warehouse-pos-*.vercel.app`
- **Automatic deployments** on every git push
- **Preview deployments** for pull requests

## 📊 Check Deployment

```bash
vercel ls          # List deployments
vercel inspect     # Inspect latest
vercel logs        # View logs
```

---

**Easiest**: Use Vercel Dashboard - just import from GitHub! 🚀
