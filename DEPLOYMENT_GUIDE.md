# Vercel Deployment Guide

## Quick Deploy to Production

### Automated Script
```bash
./deploy-production.sh
```

### Manual Steps

1. **Navigate to frontend directory**
   ```bash
   cd frontend
   ```

2. **Deploy to production**
   ```bash
   npx vercel --prod --yes
   ```

3. **Get latest deployment URL**
   ```bash
   vercel ls | grep "Ready.*Production" | head -1
   ```

4. **Update domain alias**
   ```bash
   vercel alias set <DEPLOYMENT_URL> weather.hackandbuild.dev
   ```

   Example:
   ```bash
   vercel alias set frontend-4vimvwwgq-thaaarus-projects.vercel.app weather.hackandbuild.dev
   ```

5. **Wait for propagation** (1-2 minutes)

6. **Hard refresh browser** (Ctrl+Shift+R / Cmd+Shift+R)

## Current Configuration

- **Repository**: https://github.com/thaaaru/floodwatch-damage-assessment.git
- **Project**: frontend (in `frontend/` subdirectory)
- **Production Domain**: weather.hackandbuild.dev
- **DNS**: CNAME → frontend-thaaarus-projects.vercel.app
- **Organization**: thaaarus-projects

## Important Notes

- ✅ **ALWAYS use**: `floodwatch-damage-assessment` repository
- ❌ **DO NOT use**: old `floodwatch-lk` repository
- 📁 Frontend code is in `frontend/` subdirectory
- 🔄 Domain alias must be updated after each production deployment
- 💾 Clear browser cache if changes don't appear

## Troubleshooting

### Domain not updating?
1. Check alias: `vercel alias ls | grep weather`
2. Verify deployment: `vercel ls | grep Production`
3. Wait 2-3 minutes for DNS propagation
4. Hard refresh browser cache

### Build errors?
1. Check Root Directory is set to `frontend` in Vercel Dashboard
2. Verify `package.json` has `next` dependency
3. Check build logs in Vercel Dashboard

### Changes not appearing?
1. Verify alias points to latest deployment
2. Clear browser cache (hard refresh)
3. Check Vercel deployment logs
4. Verify changes were committed and pushed

