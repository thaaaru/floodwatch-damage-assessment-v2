# How to Make `frontend-git-main-thaaarus-projects.vercel.app` the Production URL

## Method 1: Via Vercel Dashboard (Recommended)

### Step 1: Go to Vercel Dashboard
1. Visit https://vercel.com/dashboard
2. Select your `frontend` project

### Step 2: Promote Latest Deployment to Production
1. Go to the **"Deployments"** tab
2. Find the deployment that has `frontend-git-main-thaaarus-projects.vercel.app` as an alias
   - This should be the latest deployment from the `main` branch
3. Click the **three dots (⋯)** menu on that deployment
4. Select **"Promote to Production"**

This will make that deployment the production deployment, and `frontend-git-main-thaaarus-projects.vercel.app` will automatically point to it.

## Method 2: Using Vercel CLI

### Step 1: Find the deployment ID
```bash
cd /Users/tharaka/floodwatch-damage-assessment/frontend
vercel ls
```

### Step 2: Promote to production
```bash
# Find the deployment URL that has the git-main alias
# Then promote it using:
vercel promote <deployment-url>
```

For example:
```bash
vercel promote frontend-2bepsacqg-thaaarus-projects.vercel.app
```

## Method 3: Set Custom Domain/Alias

If you want `frontend-git-main-thaaarus-projects.vercel.app` to be the primary production URL:

1. Go to Vercel Dashboard → Your Project → **Settings** → **Domains**
2. Add `frontend-git-main-thaaarus-projects.vercel.app` as a custom domain
3. Or configure it as the primary production alias

## Current Status

Based on the inspection, `frontend-2bepsacqg-thaaarus-projects.vercel.app` (the latest deployment) already has these aliases:
- ✅ `https://frontend-thaaarus-projects.vercel.app` (production)
- ✅ `https://frontend-git-main-thaaarus-projects.vercel.app` (main branch preview)
- ✅ `https://frontend-gilt-seven-jxlt36esaa.vercel.app` (custom alias)

The `frontend-git-main-thaaarus-projects.vercel.app` URL **already automatically points to the latest deployment from the main branch**, so it's effectively your production URL for the main branch.

## Quick Command to Check Current Production

```bash
cd /Users/tharaka/floodwatch-damage-assessment/frontend
vercel ls | grep "Production" | head -1
```

