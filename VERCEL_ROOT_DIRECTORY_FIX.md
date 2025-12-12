# Fix: Vercel "No Next.js version detected" Error

## The Issue
Vercel is looking for `package.json` in the root directory, but your Next.js app is in the `frontend/` subdirectory.

## Solution: Set Root Directory in Vercel Dashboard

The `rootDirectory` setting must be configured in the Vercel Dashboard, not in `vercel.json`.

### Steps:

1. **Go to Vercel Dashboard**
   - Visit https://vercel.com/dashboard
   - Select your `frontend` project

2. **Navigate to Settings**
   - Click on **Settings** tab
   - Scroll down to **General** section

3. **Set Root Directory**
   - Find **Root Directory** setting
   - Click **Edit**
   - Enter: `frontend`
   - Click **Save**

4. **Redeploy**
   - After saving, Vercel will automatically trigger a new deployment
   - Or manually trigger a deployment from the Deployments tab

## Alternative: Use Vercel CLI

If you prefer using CLI:

```bash
cd /Users/tharaka/floodwatch-damage-assessment/frontend
vercel --prod
```

This will deploy from the `frontend` directory directly.

## Current Configuration

The `vercel.json` in the root has been updated to work with the frontend subdirectory, but the **Root Directory** must still be set in the Vercel Dashboard for the build to work correctly.

