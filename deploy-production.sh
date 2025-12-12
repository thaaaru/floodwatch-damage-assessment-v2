#!/bin/bash
# Deploy to Production and Update Domain Alias
# Usage: ./deploy-production.sh

set -e

echo "🚀 Deploying to Vercel Production..."

# Navigate to frontend directory
cd "$(dirname "$0")/frontend" || exit 1

# Deploy to production
echo "📦 Building and deploying..."
npx vercel --prod --yes

# Get the latest production deployment URL
echo "🔍 Finding latest production deployment..."
LATEST_DEPLOYMENT=$(vercel ls --json | jq -r '.[] | select(.target == "production" and .state == "READY") | .url' | head -1)

if [ -z "$LATEST_DEPLOYMENT" ]; then
    echo "❌ Error: Could not find latest production deployment"
    exit 1
fi

echo "✅ Latest deployment: $LATEST_DEPLOYMENT"

# Update domain alias
echo "🔗 Updating domain alias..."
vercel alias set "$LATEST_DEPLOYMENT" weather.hackandbuild.dev

echo "✅ Success! weather.hackandbuild.dev now points to $LATEST_DEPLOYMENT"
echo ""
echo "📝 Next steps:"
echo "   1. Wait 1-2 minutes for DNS propagation"
echo "   2. Hard refresh the browser (Ctrl+Shift+R / Cmd+Shift+R)"
echo "   3. Verify changes are live at https://weather.hackandbuild.dev/"

