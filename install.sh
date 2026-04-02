#!/bin/bash
set -e

# ─────────────────────────────────────────────
#  ANSI color codes
# ─────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

ok()   { echo -e "${GREEN}  ✔  $*${RESET}"; }
warn() { echo -e "${YELLOW}  ⚠  $*${RESET}"; }
err()  { echo -e "${RED}  ✖  $*${RESET}"; }
info() { echo -e "${CYAN}  ➜  $*${RESET}"; }

GITHUB_REPO="https://github.com/yuvrajnathawat/dashboard.git"
INSTALL_DIR="/opt/freenode-dashboard"

# ─────────────────────────────────────────────
#  Banner
# ─────────────────────────────────────────────
echo -e ""
echo -e "${CYAN}${BOLD}╔══════════════════════════════════════════════╗${RESET}"
echo -e "${CYAN}${BOLD}║      FreeNode Dashboard  —  Installer        ║${RESET}"
echo -e "${CYAN}${BOLD}╚══════════════════════════════════════════════╝${RESET}"
echo -e ""

# ─────────────────────────────────────────────
#  BOOTSTRAP — Clone repo if running via curl
#  (i.e. we are NOT already inside the project)
# ─────────────────────────────────────────────
if [ ! -f "package.json" ]; then
  info "Cloning FreeNode Dashboard from GitHub..."

  if ! command -v git &>/dev/null; then
    info "git not found — installing..."
    apt-get update -qq && apt-get install -y git
  fi

  if [ -d "$INSTALL_DIR" ]; then
    warn "Directory $INSTALL_DIR already exists — pulling latest changes..."
    git -C "$INSTALL_DIR" pull
  else
    git clone "$GITHUB_REPO" "$INSTALL_DIR"
  fi

  ok "Repository cloned to $INSTALL_DIR"
  info "Re-running installer from project directory..."
  echo -e ""
  exec bash "$INSTALL_DIR/install.sh"
fi

# ─────────────────────────────────────────────
#  System Checks
# ─────────────────────────────────────────────
echo -e "${BOLD}[ System Checks ]${RESET}"

# OS check
if [ ! -f /etc/os-release ]; then
  err "Cannot read /etc/os-release — unsupported OS."
  exit 1
fi

# shellcheck source=/dev/null
source /etc/os-release

if [ "$ID" != "ubuntu" ]; then
  err "Unsupported OS: $ID. This installer requires Ubuntu 20.04 or 22.04."
  exit 1
fi

if [ "$VERSION_ID" != "20.04" ] && [ "$VERSION_ID" != "22.04" ]; then
  err "Unsupported Ubuntu version: $VERSION_ID. Requires 20.04 or 22.04."
  exit 1
fi

ok "OS: Ubuntu $VERSION_ID"

# RAM check
TOTAL_KB=$(grep MemTotal /proc/meminfo | awk '{print $2}')
if [ "$TOTAL_KB" -lt 1048576 ]; then
  warn "Available RAM is less than 1 GB (${TOTAL_KB} KB). Performance may be degraded."
else
  ok "RAM: $(( TOTAL_KB / 1024 )) MB available"
fi

# Node.js — auto-install if missing or too old
install_node() {
  info "Installing Node.js 20 via NodeSource..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
}

if ! command -v node &>/dev/null; then
  warn "Node.js not found — installing automatically..."
  install_node
fi

NODE_VERSION=$(node --version | sed 's/v//')
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)

if [ "$NODE_MAJOR" -lt 18 ]; then
  warn "Node.js $NODE_VERSION is too old — upgrading..."
  install_node
  NODE_VERSION=$(node --version | sed 's/v//')
fi

ok "Node.js: v$NODE_VERSION"

# MySQL / MariaDB — auto-install if missing
if ! command -v mysql &>/dev/null; then
  warn "MySQL not found — installing MariaDB automatically..."
  apt-get update -qq
  apt-get install -y mariadb-server
  systemctl start mariadb
  systemctl enable mariadb
  ok "MariaDB installed and started."
fi

ok "MySQL/MariaDB: found"

# PM2 — auto-install if missing
if ! command -v pm2 &>/dev/null; then
  warn "PM2 not found — installing automatically..."
  npm install -g pm2
fi

ok "PM2: $(pm2 --version)"

# Nginx — auto-install if missing
if ! command -v nginx &>/dev/null; then
  echo -e ""
  read -rp "$(echo -e "${CYAN}Nginx not found. Install it now? [Y/n]: ${RESET}")" INSTALL_NGINX
  INSTALL_NGINX="${INSTALL_NGINX:-Y}"
  if [[ "$INSTALL_NGINX" =~ ^[Yy]$ ]]; then
    apt-get install -y nginx
    ok "Nginx installed."
  else
    warn "Nginx skipped. You will need to configure a reverse proxy manually."
  fi
else
  ok "Nginx: $(nginx -v 2>&1 | awk '{print $3}')"
fi

# Certbot — install if not present (needed for SSL later)
if ! command -v certbot &>/dev/null; then
  info "Installing Certbot..."
  apt-get install -y certbot python3-certbot-nginx 2>/dev/null || true
fi

echo -e ""

# ─────────────────────────────────────────────
#  Configuration Setup (10 steps)
# ─────────────────────────────────────────────
echo -e "${BOLD}[ Configuration Setup (10 steps) ]${RESET}"
echo -e ""

prompt() {
  local label="$1"
  local varname="$2"
  local default=""
  local is_secret=false
  local INPUT

  shift 2
  for arg in "$@"; do
    if [[ "$arg" == default=* ]]; then
      default="${arg#default=}"
    elif [[ "$arg" == "secret" ]]; then
      is_secret=true
    fi
  done

  if $is_secret; then
    read -rsp "$(echo -e "${CYAN}${label}: ${RESET}")" INPUT
    echo ""
  elif [ -n "$default" ]; then
    read -rp "$(echo -e "${CYAN}${label} [${default}]: ${RESET}")" INPUT
    INPUT="${INPUT:-$default}"
  else
    read -rp "$(echo -e "${CYAN}${label}: ${RESET}")" INPUT
  fi

  eval "$varname=\"\$INPUT\""
}

prompt "[1/10] Pterodactyl Panel URL (e.g., https://panel.yourdomain.com)" PTERODACTYL_URL
prompt "[2/10] Pterodactyl Application API Key (ptla_...)" PTERODACTYL_APP_API_KEY
prompt "[3/10] Pterodactyl Client API Key (ptlc_...)" PTERODACTYL_CLIENT_API_KEY
prompt "[4/10] Discord Application Client ID" DISCORD_CLIENT_ID
prompt "[5/10] Discord Application Client Secret" DISCORD_CLIENT_SECRET secret
prompt "[6/10] Discord Bot Token" DISCORD_BOT_TOKEN secret
prompt "[7/10] Discord Server (Guild) ID (leave blank = allow all users)" REQUIRED_GUILD_ID
prompt "[8/10] Dashboard URL (e.g., https://free.yourdomain.com)" DASHBOARD_URL
prompt "[9/10] MySQL root password (leave blank if none set)" MYSQL_ROOT_PASS secret
prompt "[10/10] Database name" DB_NAME "default=freenode_db"

echo -e ""
info "Generating secrets..."

SESSION_SECRET=$(openssl rand -hex 32)
DB_USER="freenode_user"
DB_PASS=$(openssl rand -hex 16)

ok "SESSION_SECRET generated."
ok "DB credentials generated (user: $DB_USER)."

# Create MySQL database and user
info "Creating MySQL database and user..."

if [ -n "$MYSQL_ROOT_PASS" ]; then
  MYSQL_EXEC="mysql -uroot -p${MYSQL_ROOT_PASS}"
else
  MYSQL_EXEC="mysql -uroot"
fi

$MYSQL_EXEC <<SQL
CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;
SQL

ok "Database '${DB_NAME}' and user '${DB_USER}' created."

# Write .env
info "Writing .env file..."

DISCORD_CALLBACK_URL="${DASHBOARD_URL}/auth/discord/callback"

sed \
  -e "s|SESSION_SECRET=changeme_super_secret_random_string|SESSION_SECRET=${SESSION_SECRET}|" \
  -e "s|APP_URL=https://free.yourdomain.com|APP_URL=${DASHBOARD_URL}|" \
  -e "s|DB_USER=freenode_user|DB_USER=${DB_USER}|" \
  -e "s|DB_PASSWORD=dbpassword|DB_PASSWORD=${DB_PASS}|" \
  -e "s|DB_NAME=freenode_db|DB_NAME=${DB_NAME}|" \
  -e "s|DISCORD_CLIENT_ID=your_client_id|DISCORD_CLIENT_ID=${DISCORD_CLIENT_ID}|" \
  -e "s|DISCORD_CLIENT_SECRET=your_client_secret|DISCORD_CLIENT_SECRET=${DISCORD_CLIENT_SECRET}|" \
  -e "s|DISCORD_CALLBACK_URL=https://free.yourdomain.com/auth/discord/callback|DISCORD_CALLBACK_URL=${DISCORD_CALLBACK_URL}|" \
  -e "s|DISCORD_BOT_TOKEN=your_bot_token|DISCORD_BOT_TOKEN=${DISCORD_BOT_TOKEN}|" \
  -e "s|PTERODACTYL_URL=https://panel.yourdomain.com|PTERODACTYL_URL=${PTERODACTYL_URL}|" \
  -e "s|PTERODACTYL_APP_API_KEY=ptla_your_application_key|PTERODACTYL_APP_API_KEY=${PTERODACTYL_APP_API_KEY}|" \
  -e "s|PTERODACTYL_CLIENT_API_KEY=ptlc_your_client_key|PTERODACTYL_CLIENT_API_KEY=${PTERODACTYL_CLIENT_API_KEY}|" \
  -e "s|REQUIRED_GUILD_ID=|REQUIRED_GUILD_ID=${REQUIRED_GUILD_ID}|" \
  .env.example > .env

ok ".env file written."
echo -e ""

# ─────────────────────────────────────────────
#  Application Setup
# ─────────────────────────────────────────────
echo -e "${BOLD}[ Application Setup ]${RESET}"
echo -e ""

info "Installing Node.js dependencies..."
npm install --production
ok "npm install complete."

info "Running database migrations..."
node db/migrate.js
ok "Migrations complete."

info "Seeding default settings..."
node db/seed.js
ok "Seed complete."

info "Starting application with PM2..."
pm2 start ecosystem.config.js --env production
ok "PM2 process started."

pm2 save
ok "PM2 process list saved."

echo -e ""
info "Setting up PM2 auto-start on reboot..."
PM2_STARTUP_CMD=$(pm2 startup systemd -u root --hp /root 2>&1 | grep "sudo" | tail -1)
if [ -n "$PM2_STARTUP_CMD" ]; then
  eval "$PM2_STARTUP_CMD" 2>/dev/null || true
  ok "PM2 startup configured."
else
  warn "Run 'pm2 startup' manually to enable auto-start on reboot."
fi

echo -e ""

# ─────────────────────────────────────────────
#  Nginx & SSL
# ─────────────────────────────────────────────
echo -e "${BOLD}[ Nginx & SSL ]${RESET}"
echo -e ""

read -rp "$(echo -e "${CYAN}Configure Nginx reverse proxy? [Y/n]: ${RESET}")" SETUP_NGINX
SETUP_NGINX="${SETUP_NGINX:-Y}"

if [[ "$SETUP_NGINX" =~ ^[Yy]$ ]]; then
  DOMAIN=$(echo "$DASHBOARD_URL" | sed -e 's|https\?://||' -e 's|/.*||')

  info "Writing Nginx config for: $DOMAIN"

  cat > /etc/nginx/sites-available/freenode <<NGINX_CONF
server {
    listen 80;
    server_name ${DOMAIN};

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINX_CONF

  ln -sf /etc/nginx/sites-available/freenode /etc/nginx/sites-enabled/freenode

  # Remove default site if it exists to avoid conflicts
  rm -f /etc/nginx/sites-enabled/default

  nginx -t && systemctl reload nginx
  ok "Nginx configured and reloaded for $DOMAIN"

  echo -e ""
  read -rp "$(echo -e "${CYAN}Set up free SSL certificate with Certbot? [Y/n]: ${RESET}")" SETUP_SSL
  SETUP_SSL="${SETUP_SSL:-Y}"

  if [[ "$SETUP_SSL" =~ ^[Yy]$ ]]; then
    info "Obtaining SSL certificate for $DOMAIN..."
    certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email || \
    certbot --nginx -d "$DOMAIN"
    ok "SSL certificate obtained and Nginx updated."
  else
    warn "SSL skipped. Run later: certbot --nginx -d ${DOMAIN}"
  fi
else
  warn "Nginx skipped. Dashboard is running on port 3000."
fi

# UFW firewall
if command -v ufw &>/dev/null; then
  info "Configuring UFW firewall..."
  ufw allow 22/tcp  2>/dev/null || true
  ufw allow 80/tcp  2>/dev/null || true
  ufw allow 443/tcp 2>/dev/null || true
  ok "UFW rules added (22, 80, 443)."
fi

# ─────────────────────────────────────────────
#  Final Summary
# ─────────────────────────────────────────────
echo -e ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════╗${RESET}"
echo -e "${GREEN}${BOLD}║     FreeNode Dashboard — Installed! 🎉       ║${RESET}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════╝${RESET}"
echo -e ""
echo -e "  ${BOLD}Dashboard URL:${RESET}  ${CYAN}${DASHBOARD_URL}${RESET}"
echo -e "  ${BOLD}Admin Panel:  ${RESET}  ${CYAN}${DASHBOARD_URL}/admin${RESET}"
echo -e "  ${BOLD}Install Dir:  ${RESET}  ${CYAN}${INSTALL_DIR}${RESET}"
echo -e "  ${BOLD}PM2 Process:  ${RESET}  ${GREEN}freenode-dashboard${RESET}"
echo -e ""
echo -e "  ${BOLD}Next steps:${RESET}"
echo -e "  1. Point your domain DNS A record to this server's IP"
echo -e "  2. Visit ${CYAN}${DASHBOARD_URL}${RESET} and login with Discord"
echo -e "  3. Add your Discord ID to ${YELLOW}ADMIN_DISCORD_IDS${RESET} in ${YELLOW}${INSTALL_DIR}/.env${RESET}"
echo -e "     then restart: ${GREEN}pm2 restart freenode-dashboard${RESET}"
echo -e ""
echo -e "  ${BOLD}Useful commands:${RESET}"
echo -e "  ${GREEN}pm2 logs freenode-dashboard${RESET}    — view live logs"
echo -e "  ${GREEN}pm2 restart freenode-dashboard${RESET} — restart app"
echo -e "  ${GREEN}pm2 status${RESET}                     — check status"
echo -e ""
