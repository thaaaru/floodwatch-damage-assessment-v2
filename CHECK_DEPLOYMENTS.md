# How to Check Vercel Deployment Commits

## Method 1: Using Vercel CLI (Recommended)

### Step 1: Login to Vercel (if not already logged in)
```bash
vercel login
```

### Step 2: List all deployments
```bash
cd frontend
vercel ls
```

This will show all deployments with their:
- URL (including preview URLs)
- Commit SHA
- Branch
- Status
- Created date

### Step 3: Get specific deployment info
```bash
# Get info for a specific deployment
vercel inspect frontend-rh902ztl6-thaaarus-projects.vercel.app
vercel inspect frontend-2bepsacqg-thaaarus-projects.vercel.app
```

### Step 4: Compare commits
```bash
# Once you have the commit SHAs, compare them
git log <commit-sha-1>..<commit-sha-2> --oneline
# Or see what's different
git diff <commit-sha-1> <commit-sha-2> --stat
```

## Method 2: Using Vercel Dashboard

1. Go to https://vercel.com/dashboard
2. Select your project (`frontend` or the project name)
3. Click on "Deployments" tab
4. Find the deployments by their URLs:
   - `frontend-rh902ztl6-thaaarus-projects.vercel.app`
   - `frontend-2bepsacqg-thaaarus-projects.vercel.app`
5. Click on each deployment to see:
   - Commit SHA
   - Branch
   - Commit message
   - Files changed

## Method 3: Using Git to Find Commits

If you know the approximate time, you can check:

```bash
# Check commits around the deployment time
git log --oneline --since="2 days ago" --until="now"
```

## Method 4: Check Deployment Headers (Quick Check)

```bash
# Get deployment info from headers
curl -sI "https://frontend-rh902ztl6-thaaarus-projects.vercel.app/" | grep -i "x-vercel"
curl -sI "https://frontend-2bepsacqg-thaaarus-projects.vercel.app/" | grep -i "x-vercel"
```

## Quick Command to Run All Checks

```bash
cd /Users/tharaka/floodwatch-damage-assessment/frontend

# 1. List deployments
echo "=== All Deployments ==="
vercel ls

# 2. Inspect specific deployments
echo -e "\n=== Deployment 1 (rh902ztl6) ==="
vercel inspect frontend-rh902ztl6-thaaarus-projects.vercel.app 2>/dev/null || echo "Use: vercel inspect <deployment-url>"

echo -e "\n=== Deployment 2 (2bepsacqg) ==="
vercel inspect frontend-2bepsacqg-thaaarus-projects.vercel.app 2>/dev/null || echo "Use: vercel inspect <deployment-url>"
```

