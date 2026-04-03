#!/bin/bash

# ─────────────────────────────────────────────
#  Razer Dashboard — Management Script
#  Made by Yuvraj — yuvrajnathawat03@gmail.com
# ─────────────────────────────────────────────

# If being piped (not interactive), save to file and re-run interactively
if [ ! -t 0 ]; then
  SCRIPT_PATH="/opt/razer-dashboard.sh"
  curl -sSL https://raw.githubusercontent.com/yuvrajnathawat/dashboard/main/freenode.sh -o "$SCRIPT_PATH"
  chmod +x "$SCRIPT_PATH"
  exec bash "$SCRIPT_PATH" < /dev/tty
fi

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

GITHUB_REPO="https://github.com/yuvrajnathawat/dashboard.git"
INSTALL_DIR="/opt/freenode-dashboard"
PM2_NAME="freenode-dashboard"

ok()   { echo -e "${GREEN}  ✔  $*${RESET}"; }
warn() { echo -e "${YELLOW}  ⚠  $*${RESET}"; }
err()  { echo -e "${RED}  ✖  $*${RESET}"; }
info() { echo -e "${CYAN}  ➜  $*${RESET}"; }

prompt() {
  local label="$1" varname="$2" default="" is_secret=false INPUT
  shift 2
  for arg in "$@"; do
    [[ "$arg" == default=* ]] && default="${arg#default=}"
    [[ "$arg" == "secret"  ]] && is_secret=true
  done
  if $is_secret; then
    read -rsp "$(echo -e "${CYAN}  ${label}: ${RESET}")" INPUT; echo ""
  elif [ -n "$default" ]; then
    read -rp  "$(echo -e "${CYAN}  ${label} [${default}]: ${RESET}")" INPUT
    INPUT="${INPUT:-$default}"
  else
    read -rp  "$(echo -e "${CYAN}  ${label}: ${RESET}")" INPUT
  fi
  eval "$varname=\"\$INPUT\""
}

show_menu() {
  clear
  echo -e ""
  echo -e "${CYAN}${BOLD}╔══════════════════════════════════════════════╗${RESET}"
  echo -e "${CYAN}${BOLD}║        Razer Dashboard  —  Menu              ║${RESET}"
  echo -e "${CYAN}${BOLD}╚══════════════════════════════════════════════╝${RESET}"
  echo -e ""
  echo -e "  ${BOLD}1)${RESET} ${GREEN}Install${RESET}          — Fresh install from GitHub"
  echo -e "  ${BOLD}2)${RESET} ${YELLOW}Update${RESET}           — Pull latest changes + restart"
  echo -e "  ${BOLD}3)${RESET} ${CYAN}Rebuild${RESET}          — Full rebuild (npm install + migrate)"
  echo -e "  ${BOLD}4)${RESET} ${GREEN}Start${RESET}            — Start the dashboard"
  echo -e "  ${BOLD}5)${RESET} ${YELLOW}Restart${RESET}          — Restart the dashboard"
  echo -e "  ${BOLD}6)${RESET} ${RED}Stop${RESET}             — Stop the dashboard"
  echo -e "  ${BOLD}7)${RESET} ${CYAN}Status${RESET}           — Show PM2 status"
  echo -e "  ${BOLD}8)${RESET} ${CYAN}Logs${RESET}             — Show live logs"
  echo -e "  ${BOLD}9)${RESET} ${YELLOW}Fix${RESET}              — Fix errors (re-migrate + restart)"
  echo -e "  ${BOLD}10)${RESET} ${YELLOW}Set Admin${RESET}        — Make a Discord user admin"
  echo -e "  ${BOLD}11)${RESET} ${RED}Uninstall${RESET}        — Remove EVERYTHING"
  echo -e "  ${BOLD}0)${RESET}  Exit"
  echo -e ""
  read -rp "$(echo -e "${CYAN}  Select option [0-11]: ${RESET}")" CHOICE
}

# ─── Install ──────────────────────────────────────────────────────────────────
do_install() {
  echo -e ""
  info "Starting fresh installation..."

  # Check root
  if [ "$EUID" -ne 0 ]; then
    err "Please run as root (sudo bash freenode.sh)"
    return
  fi

  # Clone or update repo
  if [ -d "$INSTALL_DIR" ]; then
    warn "Already installed at $INSTALL_DIR"
    read -rp "$(echo -e "${YELLOW}  Reinstall? This will overwrite files [y/N]: ${RESET}")" CONFIRM
    [[ ! "$CONFIRM" =~ ^[Yy]$ ]] && warn "Cancelled." && return
    git -C "$INSTALL_DIR" pull --ff-only 2>/dev/null || git -C "$INSTALL_DIR" pull
  else
    if ! command -v git &>/dev/null; then
      info "Installing git..."
      apt-get update -qq && apt-get install -y git
    fi
    git clone "$GITHUB_REPO" "$INSTALL_DIR"
  fi

  cd "$INSTALL_DIR" || return

  # Node.js
  if ! command -v node &>/dev/null || [ "$(node --version | sed 's/v//' | cut -d. -f1)" -lt 18 ]; then
    info "Installing Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
  fi
  ok "Node.js: $(node --version)"

  # MariaDB
  if ! command -v mysql &>/dev/null; then
    info "Installing MariaDB..."
    apt-get update -qq && apt-get install -y mariadb-server
  fi
  if ! mysqladmin ping --silent 2>/dev/null; then
    systemctl start mariadb 2>/dev/null || service mariadb start 2>/dev/null || true
    systemctl enable mariadb 2>/dev/null || true
    for i in $(seq 1 15); do mysqladmin ping --silent 2>/dev/null && break; sleep 1; done
  fi
  ok "MariaDB: running"

  # PM2
  if ! command -v pm2 &>/dev/null; then
    info "Installing PM2..."
    npm install -g pm2
  fi
  ok "PM2: $(pm2 --version)"

  # Nginx
  if ! command -v nginx &>/dev/null; then
    read -rp "$(echo -e "${CYAN}  Install Nginx? [Y/n]: ${RESET}")" INS_NGX
    [[ "${INS_NGX:-Y}" =~ ^[Yy]$ ]] && apt-get install -y nginx && ok "Nginx installed."
  else
    ok "Nginx: found"
  fi

  # Certbot
  if ! command -v certbot &>/dev/null; then
    apt-get install -y certbot python3-certbot-nginx 2>/dev/null || true
  fi

  echo -e ""
  echo -e "${BOLD}  [ Configuration — 10 steps ]${RESET}"
  echo -e ""

  prompt "[1/10] Pterodactyl Panel URL (e.g. https://panel.yourdomain.com)" PTERODACTYL_URL
  prompt "[2/10] Pterodactyl Application API Key (ptla_...)" PTERODACTYL_APP_API_KEY
  prompt "[3/10] Pterodactyl Client API Key (ptlc_...)" PTERODACTYL_CLIENT_API_KEY
  prompt "[4/10] Discord Client ID" DISCORD_CLIENT_ID
  prompt "[5/10] Discord Client Secret" DISCORD_CLIENT_SECRET secret
  prompt "[6/10] Discord Bot Token" DISCORD_BOT_TOKEN secret
  prompt "[7/10] Discord Server (Guild) ID (leave blank = allow all)" REQUIRED_GUILD_ID
  prompt "[8/10] Dashboard URL (e.g. https://free.yourdomain.com)" DASHBOARD_URL
  prompt "[9/10] MySQL root password (leave blank if none)" MYSQL_ROOT_PASS secret
  prompt "[10/10] Database name" DB_NAME "default=freenode_db"

  echo -e ""
  info "Generating secrets..."
  SESSION_SECRET=$(openssl rand -hex 32)
  DB_USER="freenode_user"
  DB_PASS=$(openssl rand -hex 16)
  ok "Secrets generated."

  # Create DB
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
  ok "Database '${DB_NAME}' ready."

  # Write .env
  info "Writing .env..."
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
  ok ".env written."

  # App setup
  info "Installing npm dependencies..."
  npm install --production
  ok "npm install done."

  info "Running migrations..."
  node db/migrate.js
  ok "Migrations done."

  info "Seeding defaults..."
  node db/seed.js
  ok "Seed done."

  info "Starting with PM2..."
  pm2 start ecosystem.config.js --env production
  pm2 save
  ok "PM2 started."

  PM2_STARTUP=$(pm2 startup systemd -u root --hp /root 2>&1 | grep "sudo" | tail -1)
  [ -n "$PM2_STARTUP" ] && eval "$PM2_STARTUP" 2>/dev/null && ok "PM2 auto-start configured."

  # Nginx
  read -rp "$(echo -e "${CYAN}  Configure Nginx reverse proxy? [Y/n]: ${RESET}")" SETUP_NGX
  if [[ "${SETUP_NGX:-Y}" =~ ^[Yy]$ ]]; then
    DOMAIN=$(echo "$DASHBOARD_URL" | sed -e 's|https\?://||' -e 's|/.*||')
    cat > /etc/nginx/sites-available/freenode <<NGINX
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
NGINX
    ln -sf /etc/nginx/sites-available/freenode /etc/nginx/sites-enabled/freenode
    rm -f /etc/nginx/sites-enabled/default
    nginx -t && (systemctl reload nginx 2>/dev/null || service nginx reload 2>/dev/null || true)
    ok "Nginx configured for $DOMAIN"

    read -rp "$(echo -e "${CYAN}  Setup SSL with Certbot? [Y/n]: ${RESET}")" SETUP_SSL
    if [[ "${SETUP_SSL:-Y}" =~ ^[Yy]$ ]]; then
      certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email \
        || certbot --nginx -d "$DOMAIN"
      ok "SSL configured."
    fi
  fi

  # UFW
  if command -v ufw &>/dev/null; then
    ufw allow 22/tcp 2>/dev/null; ufw allow 80/tcp 2>/dev/null; ufw allow 443/tcp 2>/dev/null
    ok "UFW rules added."
  fi

  echo -e ""
  echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════╗${RESET}"
  echo -e "${GREEN}${BOLD}║     Razer Dashboard — Installed! ✔           ║${RESET}"
  echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════╝${RESET}"
  echo -e ""
  echo -e "  Dashboard:  ${CYAN}${DASHBOARD_URL}${RESET}"
  echo -e "  Admin:      ${CYAN}${DASHBOARD_URL}/admin${RESET}"
  echo -e ""
  echo -e "  Next steps:"
  echo -e "  1. Login with Discord at ${CYAN}${DASHBOARD_URL}${RESET}"
  echo -e "  2. Run option ${BOLD}10${RESET} to make yourself admin"
  echo -e "  3. Go to ${CYAN}/admin/settings${RESET} to configure branding"
  echo -e ""
}

# ─── Update ───────────────────────────────────────────────────────────────────
do_update() {
  info "Pulling latest changes..."
  cd "$INSTALL_DIR" || { err "Not installed at $INSTALL_DIR"; return; }
  git pull --ff-only 2>/dev/null || git pull
  ok "Code updated."
  pm2 restart "$PM2_NAME" 2>/dev/null || pm2 start ecosystem.config.js --env production
  pm2 save
  ok "Dashboard restarted."
  pm2 status
}

# ─── Rebuild ──────────────────────────────────────────────────────────────────
do_rebuild() {
  info "Full rebuild..."
  cd "$INSTALL_DIR" || { err "Not installed at $INSTALL_DIR"; return; }
  git pull --ff-only 2>/dev/null || git pull
  npm install --production
  node db/migrate.js
  node db/seed.js
  pm2 restart "$PM2_NAME" 2>/dev/null || pm2 start ecosystem.config.js --env production
  pm2 save
  ok "Rebuild complete."
  pm2 status
}

# ─── Start / Restart / Stop ───────────────────────────────────────────────────
do_start() {
  cd "$INSTALL_DIR" || { err "Not installed at $INSTALL_DIR"; return; }
  pm2 start ecosystem.config.js --env production 2>/dev/null || pm2 restart "$PM2_NAME"
  ok "Started."; pm2 status
}

do_restart() {
  pm2 restart "$PM2_NAME" && ok "Restarted." || err "Failed to restart."
  pm2 status
}

do_stop() {
  pm2 stop "$PM2_NAME" && ok "Stopped." || err "Failed to stop."
}

# ─── Status / Logs ────────────────────────────────────────────────────────────
do_status() {
  pm2 status
  echo -e ""
  pm2 logs "$PM2_NAME" --lines 15 --nostream
}

do_logs() {
  info "Last 50 log lines (Ctrl+C to exit):"
  echo -e ""
  pm2 logs "$PM2_NAME" --lines 50 --nostream
}

# ─── Fix ──────────────────────────────────────────────────────────────────────
do_fix() {
  info "Running fix..."
  cd "$INSTALL_DIR" || { err "Not installed at $INSTALL_DIR"; return; }
  node db/migrate.js && ok "Migrations OK." || warn "Migration issues."
  node db/seed.js    && ok "Seed OK."        || warn "Seed issues."
  pm2 restart "$PM2_NAME" 2>/dev/null || pm2 start ecosystem.config.js --env production
  ok "Fix complete."
  pm2 logs "$PM2_NAME" --lines 20 --nostream
}

# ─── Set Admin ────────────────────────────────────────────────────────────────
do_set_admin() {
  echo -e ""
  read -rp "$(echo -e "${CYAN}  Enter Discord User ID to make admin: ${RESET}")" DISCORD_ID
  [ -z "$DISCORD_ID" ] && err "No Discord ID entered." && return

  if [ ! -f "$INSTALL_DIR/.env" ]; then
    err ".env not found at $INSTALL_DIR/.env"
    return
  fi

  DB_USER=$(grep "^DB_USER="     "$INSTALL_DIR/.env" | cut -d= -f2 | tr -d '[:space:]')
  DB_PASS=$(grep "^DB_PASSWORD=" "$INSTALL_DIR/.env" | cut -d= -f2 | tr -d '[:space:]')
  DB_NAME=$(grep "^DB_NAME="     "$INSTALL_DIR/.env" | cut -d= -f2 | tr -d '[:space:]')

  MYSQL_CNF=$(mktemp)
  printf '[client]\nuser=%s\npassword=%s\n' "$DB_USER" "$DB_PASS" > "$MYSQL_CNF"
  chmod 600 "$MYSQL_CNF"

  mysql --defaults-file="$MYSQL_CNF" "$DB_NAME" \
    -e "UPDATE users SET is_admin = 1 WHERE discord_id = '${DISCORD_ID}';" 2>/tmp/mysql_err

  if [ $? -ne 0 ]; then
    err "MySQL error: $(cat /tmp/mysql_err)"
    rm -f "$MYSQL_CNF"; return
  fi

  ROWS=$(mysql --defaults-file="$MYSQL_CNF" "$DB_NAME" \
    -se "SELECT COUNT(*) FROM users WHERE discord_id = '${DISCORD_ID}' AND is_admin = 1;" 2>/dev/null)
  rm -f "$MYSQL_CNF"

  if [ "$ROWS" = "1" ]; then
    ok "User $DISCORD_ID is now admin!"
    info "Admin status is permanent — no re-login needed."
  else
    err "User not found. Make sure they have logged in at least once."
  fi
}

# ─── Uninstall ────────────────────────────────────────────────────────────────
do_uninstall() {
  echo -e ""
  echo -e "${RED}${BOLD}  ⚠  WARNING: This will DELETE everything!${RESET}"
  echo -e "${RED}  Removes files, database, PM2 process, and Nginx config.${RESET}"
  echo -e ""
  read -rp "$(echo -e "${YELLOW}  Type 'DELETE' to confirm: ${RESET}")" CONFIRM
  [ "$CONFIRM" != "DELETE" ] && warn "Cancelled." && return

  pm2 stop   "$PM2_NAME" 2>/dev/null || true
  pm2 delete "$PM2_NAME" 2>/dev/null || true
  ok "PM2 process removed."

  if [ -f "$INSTALL_DIR/.env" ]; then
    DB_NAME=$(grep "^DB_NAME="     "$INSTALL_DIR/.env" | cut -d= -f2)
    DB_USER=$(grep "^DB_USER="     "$INSTALL_DIR/.env" | cut -d= -f2)
    DB_PASS=$(grep "^DB_PASSWORD=" "$INSTALL_DIR/.env" | cut -d= -f2)
    if [ -n "$DB_NAME" ]; then
      mysql -u"$DB_USER" -p"$DB_PASS" -e "DROP DATABASE IF EXISTS \`${DB_NAME}\`;" 2>/dev/null || \
      mysql -uroot -e "DROP DATABASE IF EXISTS \`${DB_NAME}\`;" 2>/dev/null || true
      mysql -uroot -e "DROP USER IF EXISTS '${DB_USER}'@'localhost';" 2>/dev/null || true
      ok "Database removed."
    fi
  fi

  rm -f /etc/nginx/sites-enabled/freenode /etc/nginx/sites-available/freenode
  systemctl reload nginx 2>/dev/null || service nginx reload 2>/dev/null || true
  ok "Nginx config removed."

  rm -rf "$INSTALL_DIR"
  ok "All files deleted."

  echo -e ""
  echo -e "${GREEN}${BOLD}  ✔  Uninstall complete!${RESET}"
  echo -e "  Reinstall: ${CYAN}curl -sSL https://raw.githubusercontent.com/yuvrajnathawat/dashboard/main/freenode.sh | bash${RESET}"
  echo -e ""
}

# ─── Main Loop ────────────────────────────────────────────────────────────────
while true; do
  show_menu
  case "$CHOICE" in
    1)  do_install   ;;
    2)  do_update    ;;
    3)  do_rebuild   ;;
    4)  do_start     ;;
    5)  do_restart   ;;
    6)  do_stop      ;;
    7)  do_status    ;;
    8)  do_logs      ;;
    9)  do_fix       ;;
    10) do_set_admin ;;
    11) do_uninstall ;;
    0)  echo -e "\n  Bye!\n"; exit 0 ;;
    *)  warn "Invalid option. Please select 0-11." ;;
  esac
  echo -e ""
  read -rp "$(echo -e "${CYAN}  Press Enter to return to menu...${RESET}")" _
done
