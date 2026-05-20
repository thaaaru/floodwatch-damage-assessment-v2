#!/bin/bash
# Frontend Deployment Script for DigitalOcean Droplet
# Removes all software and installs FloodWatch LK Frontend
# Usage: bash deploy/frontend-deploy.sh <SERVER_IP> <DOMAIN>

set -e

SERVER_IP="${1:-142.93.218.223}"
DOMAIN="${2:-weather.hackandbuild.dev}"
BACKEND_URL="${3:-http://198.199.76.11:8000}"

echo "=========================================="
echo "FloodWatch LK Frontend Deployment"
echo "=========================================="
echo "Server IP: $SERVER_IP"
echo "Domain: $DOMAIN"
echo "Backend URL: $BACKEND_URL"
echo ""

# SSH into the server and run setup
ssh -o StrictHostKeyChecking=no root@"$SERVER_IP" << 'EOF'
set -e

echo "=== Phase 1: Cleaning System ==="
echo "Removing all running services and software..."

# Stop all services
systemctl stop nginx 2>/dev/null || true
systemctl stop floodwatch 2>/dev/null || true
systemctl stop postgresql 2>/dev/null || true
systemctl disable nginx 2>/dev/null || true
systemctl disable floodwatch 2>/dev/null || true
systemctl disable postgresql 2>/dev/null || true

# Remove software packages
apt-get update
apt-get autoremove -y
apt-get remove -y nginx python3 postgresql postgresql-client postgresql-common 2>/dev/null || true
apt-get remove -y python3-pip python3-venv 2>/dev/null || true
apt-get purge -y postgresql* 2>/dev/null || true
apt-get autoremove -y

# Remove old application directories
rm -rf /opt/floodwatch 2>/dev/null || true
rm -rf /opt/floodwatch-frontend 2>/dev/null || true
rm -rf /opt/frontend 2>/dev/null || true

# Remove old users
userdel -r floodwatch 2>/dev/null || true

# Clean nginx configs
rm -rf /etc/nginx 2>/dev/null || true

echo "=== System cleanup complete ==="
echo ""

echo "=== Phase 2: Installing Dependencies ==="

# Update system
apt-get update
apt-get upgrade -y

# Install Node.js LTS (20.x)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Install npm packages globally
npm install -g pm2

# Install Nginx
apt-get install -y nginx

# Install Certbot for SSL
apt-get install -y certbot python3-certbot-nginx

echo "Node.js version: $(node -v)"
echo "npm version: $(npm -v)"
echo "PM2 version: $(pm2 -v)"

echo "=== Dependencies installation complete ==="
echo ""

echo "=== Phase 3: Cloning Frontend Repository ==="

# Create application directory
mkdir -p /opt/floodwatch-frontend
cd /opt/floodwatch-frontend

# Clone the repository (using the provided repo URL)
git clone https://github.com/thaaaru/floodwatch-damage-assessment-v2.git /tmp/repo
cp -r /tmp/repo/frontend/* /opt/floodwatch-frontend/
rm -rf /tmp/repo

cd /opt/floodwatch-frontend

echo "=== Repository cloned ==="
echo ""

echo "=== Phase 4: Building Frontend ==="

# Install dependencies
npm install

# Create .env.production file
cat > .env.production << 'ENVEOF'
NEXT_PUBLIC_API_URL=http://198.199.76.11:8000
NEXT_PUBLIC_PROD_API_URL=https://api.hackandbuild.dev
NODE_ENV=production
ENVEOF

# Build the application
npm run build

echo "=== Build complete ==="
echo ""

echo "=== Phase 5: Configuring PM2 ==="

# Create PM2 ecosystem config
cat > ecosystem.config.js << 'PMEOF'
module.exports = {
  apps: [{
    name: 'floodwatch-frontend',
    script: 'npm',
    args: 'start',
    env: {
      NODE_ENV: 'production',
      NEXT_PUBLIC_API_URL: 'http://198.199.76.11:8000',
      NEXT_PUBLIC_PROD_API_URL: 'https://api.hackandbuild.dev'
    },
    instances: 'max',
    exec_mode: 'cluster',
    error_file: '/var/log/pm2/floodwatch-frontend-error.log',
    out_file: '/var/log/pm2/floodwatch-frontend-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    env_production: {
      NODE_ENV: 'production'
    }
  }]
};
PMEOF

# Create log directory
mkdir -p /var/log/pm2

# Start with PM2
pm2 start ecosystem.config.js

# Save PM2 startup
pm2 save
pm2 startup systemd -u root --hp /root

echo "=== PM2 configured and started ==="
echo ""

echo "=== Phase 6: Configuring Nginx ==="

# Create nginx config
cat > /etc/nginx/sites-available/floodwatch-frontend << 'NGINXEOF'
upstream nextjs_backend {
    server localhost:3000;
}

server {
    listen 80;
    server_name _;

    client_max_body_size 50M;

    # Redirect HTTP to HTTPS (will be configured after SSL)
    location / {
        proxy_pass http://nextjs_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Health check endpoint
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
}
NGINXEOF

# Enable the site
ln -sf /etc/nginx/sites-available/floodwatch-frontend /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true

# Test nginx config
nginx -t

# Start nginx
systemctl enable nginx
systemctl start nginx

echo "=== Nginx configured ==="
echo ""

echo "=========================================="
echo "✅ FRONTEND DEPLOYMENT COMPLETE"
echo "=========================================="
echo ""
echo "Frontend is now running on:"
echo "  - HTTP: http://$(hostname -I | awk '{print $1}'):80"
echo "  - Node.js port: 3000 (via Nginx)"
echo ""
echo "Next steps:"
echo "1. Set up SSL certificate:"
echo "   certbot --nginx -d weather.hackandbuild.dev"
echo "2. Update DNS to point weather.hackandbuild.dev to: $(hostname -I | awk '{print $1}')"
echo ""
echo "To manage the application:"
echo "  pm2 logs               - View logs"
echo "  pm2 restart all        - Restart app"
echo "  pm2 stop all           - Stop app"
echo "  pm2 delete all         - Remove from PM2"
echo ""

EOF

echo "✅ Script transferred and executed successfully!"
echo ""
echo "Server setup complete. Next steps:"
echo "1. Run SSL certificate setup (you'll be asked to confirm DNS):"
echo "   ssh root@$SERVER_IP 'certbot --nginx -d weather.hackandbuild.dev'"
echo "2. Update DNS to point weather.hackandbuild.dev to the server IP"
echo ""
