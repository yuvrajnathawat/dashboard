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

# ─────────────────────────────────────────────
#  Banner
# ─────────────────────────────────────────────
clear
echo -e ""
echo -e "${CYAN}${BOLD}╔══════════════════════════════════════════════╗${RESET}"
echo -e "${CYAN}${BOLD}║   FreeNode Dashboard - Interactive Setup    ║${RESET}"
echo -e "${CYAN}${BOLD}╚══════════════════════════════════════════════╝${RESET}"
echo -e ""

# ─────────────────────────────────────────────
#  Main Menu
# ─────────────────────────────────────────────
show_menu() {
  echo -e "${BOLD}Select Installation Option:${RESET}"
  echo -e ""
  echo -e "  ${CYAN}1)${RESET} Full Installation (Recommended)"
  echo -e "     - Install all dependencies"
  echo -e "     - Configure database"
  echo -e "     - Setup Nginx & SSL"
  echo -e "     - Start with PM2"
  echo -e ""
  echo -e "  ${CYAN}2)${RESET} Quick Install (Skip Nginx/SSL)"
  echo -e "     - Install dependencies"
  echo -e "     - Configure database"
  echo -e "     - Start with PM2 only"
  echo -e ""
  echo -e "  ${CYAN}3)${RESET} Update Existing Installation"
  echo -e "     - Pull latest code"
  echo -e "     - Update dependencies"
  echo -e "     - Restart services"
  echo -e ""
  echo -e "  ${CYAN}4)${RESET} Repair/Reconfigure"
  echo -e "     - Fix database issues"
  echo -e "     - Regenerate .env"
  echo -e "     - Restart services"
  echo -e ""
  echo -e "  ${CYAN}5)${RESET} Uninstall"
  echo -e "     - Remove application"
  echo -e "     - Clean database (optional)"
  echo -e ""
  echo -e "  ${CYAN}0)${RESET} Exit"
  echo -e ""
}

# ─────────────────────────────────────────────
#  Helper Functions
# ─────────────────────────────────────────────
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

check_root() {
  if [ "$EUID" -ne 0 ]; then
    err "This script must be run as root (use sudo)"
    exit 1
  fi
}

install_dependencies() {
  info "Checking and installing dependencies..."
  
  # Node.js
  if ! command -v node &>/dev/null || [ "$(node --version | sed 's/v//' | cut -d. -f1)" -lt 18 ]; then
    info "Installing Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
  fi
  ok "Node.js: $(node --version)"
  
  # MySQL/MariaDB
  if ! command -v mysql &>/dev/null; then
    info "Installing MariaDB..."
    apt-get update -qq
    apt-get install -y mariadb-server
  fi
  
  if ! mysqladmin ping --silent 2>/dev/null; then
    systemctl start mariadb 2>/dev/null || service mariadb start
    systemctl enable mariadb 2>/dev/null || true
  fi
  ok "MariaDB: running"
  
  # PM2
  if ! command -v pm2 &>/dev/null; then
    info "Installing PM2..."
    npm install -g pm2
  fi
  ok "PM2: $(pm2 --version)"
}

configure_app() {
  echo -e ""
  echo -e "${BOLD}[ Configuration (10 steps) ]${RESET}"
  echo -e ""
  
  prompt "[1/10] Pterodactyl Panel URL" PTERODACTYL_URL
  prompt "[2/10] Pterodactyl Application API Key" PTERODACTYL_APP_API_KEY
  prompt "[3/10] Pterodactyl Client API Key" PTERODACTYL_CLIENT_API_KEY
  prompt "[4/10] Discord Client ID" DISCORD_CLIENT_ID
  prompt "[5/10] Discord Client Secret" DISCORD_CLIENT_SECRET secret
  prompt "[6/10] Discord Bot Token" DISCORD_BOT_TOKEN secret
  prompt "[7/10] Discord Server ID (optional)" REQUIRED_GUILD_ID
  prompt "[8/10] Dashboard URL" DASHBOARD_URL
  prompt "[9/10] MySQL root password (leave blank if none)" MYSQL_ROOT_PASS secret
  prompt "[10/10] Database name" DB_NAME "default=freenode_db"
  
  info "Generating secrets..."
  SESSION_SECRET=$(openssl rand -hex 32)
  DB_USER="freenode_user"
  DB_PASS=$(openssl rand -hex 16)
  
  ok "Secrets generated"
  
  # Create database
  info "Setting up database..."
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
  
  ok "Database configured"
  
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
  
  ok ".env file created"
}

setup_app() {
  info "Installing npm dependencies..."
  npm install --production
  ok "Dependencies installed"
  
  info "Running migrations..."
  node db/migrate.js
  ok "Migrations complete"
  
  info "Seeding database..."
  node db/seed.js
  ok "Database seeded"
  
  info "Starting with PM2..."
  pm2 start ecosystem.config.js --env production
  pm2 save
  ok "Application started"
  
  PM2_STARTUP_CMD=$(pm2 startup systemd -u root --hp /root 2>&1 | grep "sudo" | tail -1)
  if [ -n "$PM2_STARTUP_CMD" ]; then
    eval "$PM2_STARTUP_CMD" 2>/dev/null || true
    ok "PM2 auto-start configured"
  fi
}

setup_nginx() {
  if ! command -v nginx &>/dev/null; then
    info "Installing Nginx..."
    apt-get install -y nginx
  fi
  
  if ! command -v certbot &>/dev/null; then
    info "Installing Certbot..."
    apt-get install -y certbot python3-certbot-nginx
  fi
  
  DOMAIN=$(echo "$DASHBOARD_URL" | sed -e 's|https\?://||' -e 's|/.*||')
  
  info "Configuring Nginx for $DOMAIN..."
  
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
  rm -f /etc/nginx/sites-enabled/default
  
  nginx -t && systemctl reload nginx
  ok "Nginx configured"
  
  echo -e ""
  read -rp "$(echo -e "${CYAN}Setup SSL with Certbot? [Y/n]: ${RESET}")" SETUP_SSL
  SETUP_SSL="${SETUP_SSL:-Y}"
  
  if [[ "$SETUP_SSL" =~ ^[Yy]$ ]]; then
    info "Obtaining SSL certificate..."
    certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email || \
    certbot --nginx -d "$DOMAIN"
    ok "SSL configured"
  fi
}

# ─────────────────────────────────────────────
#  Installation Options
# ─────────────────────────────────────────────
full_install() {
  echo -e ""
  info "Starting Full Installation..."
  echo -e ""
  
  check_root
  install_dependencies
  configure_app
  setup_app
  setup_nginx
  
  echo -e ""
  echo -e "${GREEN}${BOLD}✓ Full Installation Complete!${RESET}"
  echo -e ""
  echo -e "  Dashboard: ${CYAN}${DASHBOARD_URL}${RESET}"
  echo -e "  Admin: ${CYAN}${DASHBOARD_URL}/admin${RESET}"
  echo -e ""
  echo -e "  Add your Discord ID to ADMIN_DISCORD_IDS in .env"
  echo -e "  Then run: ${GREEN}pm2 restart freenode-dashboard${RESET}"
  echo -e ""
}

quick_install() {
  echo -e ""
  info "Starting Quick Installation..."
  echo -e ""
  
  check_root
  install_dependencies
  configure_app
  setup_app
  
  echo -e ""
  echo -e "${GREEN}${BOLD}✓ Quick Installation Complete!${RESET}"
  echo -e ""
  echo -e "  Dashboard running on: ${CYAN}http://localhost:3000${RESET}"
  echo -e "  Configure Nginx manually or run option 1 for full setup"
  echo -e ""
}

update_install() {
  echo -e ""
  info "Updating installation..."
  echo -e ""
  
  check_root
  
  info "Pulling latest code..."
  git pull
  ok "Code updated"
  
  info "Updating dependencies..."
  npm install --production
  ok "Dependencies updated"
  
  info "Running migrations..."
  node db/migrate.js
  ok "Migrations complete"
  
  info "Restarting application..."
  pm2 restart freenode-dashboard
  ok "Application restarted"
  
  echo -e ""
  echo -e "${GREEN}${BOLD}✓ Update Complete!${RESET}"
  echo -e ""
}

repair_install() {
  echo -e ""
  info "Repairing installation..."
  echo -e ""
  
  check_root
  
  read -rp "$(echo -e "${CYAN}Regenerate .env file? [y/N]: ${RESET}")" REGEN_ENV
  if [[ "$REGEN_ENV" =~ ^[Yy]$ ]]; then
    configure_app
  fi
  
  read -rp "$(echo -e "${CYAN}Run database migrations? [Y/n]: ${RESET}")" RUN_MIGRATE
  RUN_MIGRATE="${RUN_MIGRATE:-Y}"
  if [[ "$RUN_MIGRATE" =~ ^[Yy]$ ]]; then
    info "Running migrations..."
    node db/migrate.js
    ok "Migrations complete"
  fi
  
  info "Restarting application..."
  pm2 restart freenode-dashboard 2>/dev/null || pm2 start ecosystem.config.js --env production
  ok "Application restarted"
  
  echo -e ""
  echo -e "${GREEN}${BOLD}✓ Repair Complete!${RESET}"
  echo -e ""
}

uninstall() {
  echo -e ""
  warn "This will remove the FreeNode Dashboard"
  read -rp "$(echo -e "${RED}Are you sure? [y/N]: ${RESET}")" CONFIRM
  
  if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    info "Uninstall cancelled"
    return
  fi
  
  check_root
  
  info "Stopping PM2 process..."
  pm2 delete freenode-dashboard 2>/dev/null || true
  pm2 save
  ok "PM2 process removed"
  
  read -rp "$(echo -e "${CYAN}Remove database? [y/N]: ${RESET}")" REMOVE_DB
  if [[ "$REMOVE_DB" =~ ^[Yy]$ ]]; then
    if [ -f .env ]; then
      source .env
      info "Dropping database..."
      mysql -uroot -e "DROP DATABASE IF EXISTS \`${DB_NAME}\`; DROP USER IF EXISTS '${DB_USER}'@'localhost';" 2>/dev/null || true
      ok "Database removed"
    fi
  fi
  
  read -rp "$(echo -e "${CYAN}Remove Nginx config? [y/N]: ${RESET}")" REMOVE_NGINX
  if [[ "$REMOVE_NGINX" =~ ^[Yy]$ ]]; then
    rm -f /etc/nginx/sites-enabled/freenode
    rm -f /etc/nginx/sites-available/freenode
    systemctl reload nginx 2>/dev/null || true
    ok "Nginx config removed"
  fi
  
  echo -e ""
  echo -e "${GREEN}${BOLD}✓ Uninstall Complete!${RESET}"
  echo -e ""
  info "Application files remain in current directory"
  info "Remove manually with: rm -rf $(pwd)"
  echo -e ""
}

# ─────────────────────────────────────────────
#  Main Loop
# ─────────────────────────────────────────────
while true; do
  show_menu
  read -rp "$(echo -e "${CYAN}Enter option [0-5]: ${RESET}")" choice
  
  case $choice in
    1) full_install ;;
    2) quick_install ;;
    3) update_install ;;
    4) repair_install ;;
    5) uninstall ;;
    0) echo -e ""; info "Goodbye!"; echo -e ""; exit 0 ;;
    *) err "Invalid option. Please select 0-5." ;;
  esac
  
  echo -e ""
  read -rp "$(echo -e "${CYAN}Press Enter to return to menu...${RESET}")"
  clear
done
