#!/bin/bash

# ─────────────────────────────────────────────
#  FreeNode Dashboard — Interactive Menu
# ─────────────────────────────────────────────

# If being piped (not interactive), save to file and re-run
if [ ! -t 0 ]; then
  SCRIPT_PATH="/opt/freenode.sh"
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

INSTALL_DIR="/opt/freenode-dashboard"
PM2_NAME="freenode-dashboard"

ok()   { echo -e "${GREEN}  ✔  $*${RESET}"; }
warn() { echo -e "${YELLOW}  ⚠  $*${RESET}"; }
err()  { echo -e "${RED}  ✖  $*${RESET}"; }
info() { echo -e "${CYAN}  ➜  $*${RESET}"; }

show_menu() {
  clear
  echo -e ""
  echo -e "${CYAN}${BOLD}╔══════════════════════════════════════════════╗${RESET}"
  echo -e "${CYAN}${BOLD}║      FreeNode Dashboard  —  Menu             ║${RESET}"
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
  echo -e "  ${BOLD}11)${RESET} ${RED}Uninstall${RESET}        — Remove EVERYTHING (fresh start)"
  echo -e "  ${BOLD}0)${RESET}  Exit"
  echo -e ""
  read -rp "$(echo -e "${CYAN}  Select option [0-11]: ${RESET}")" CHOICE
}

do_install() {
  info "Starting fresh installation..."
  export FREENODE_BOOTSTRAPPED=1
  if [ -d "$INSTALL_DIR" ]; then
    warn "Already installed at $INSTALL_DIR"
    read -rp "$(echo -e "${YELLOW}  Reinstall? This will overwrite files [y/N]: ${RESET}")" CONFIRM
    if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
      warn "Cancelled."
      return
    fi
    git -C "$INSTALL_DIR" pull --ff-only 2>/dev/null || git -C "$INSTALL_DIR" pull
  else
    git clone https://github.com/yuvrajnathawat/dashboard.git "$INSTALL_DIR"
  fi
  cd "$INSTALL_DIR"
  bash install.sh
}

do_update() {
  info "Pulling latest changes..."
  cd "$INSTALL_DIR"
  git pull --ff-only 2>/dev/null || git pull
  ok "Code updated."
  pm2 restart "$PM2_NAME" 2>/dev/null || pm2 start ecosystem.config.js --env production
  pm2 save
  ok "Dashboard restarted."
  pm2 status
}

do_rebuild() {
  info "Full rebuild..."
  cd "$INSTALL_DIR"
  git pull --ff-only 2>/dev/null || git pull
  npm install --production
  node db/migrate.js
  node db/seed.js
  pm2 restart "$PM2_NAME" 2>/dev/null || pm2 start ecosystem.config.js --env production
  pm2 save
  ok "Rebuild complete."
  pm2 status
}

do_start() {
  cd "$INSTALL_DIR"
  pm2 start ecosystem.config.js --env production 2>/dev/null || pm2 restart "$PM2_NAME"
  ok "Started."
  pm2 status
}

do_restart() {
  pm2 restart "$PM2_NAME"
  ok "Restarted."
  pm2 status
}

do_stop() {
  pm2 stop "$PM2_NAME"
  ok "Stopped."
}

do_status() {
  pm2 status
  echo -e ""
  pm2 logs "$PM2_NAME" --lines 10 --nostream
}

do_logs() {
  echo -e "${CYAN}  Showing last 50 log lines (press Ctrl+C to exit):${RESET}"
  echo -e ""
  pm2 logs "$PM2_NAME" --lines 50 --nostream
}

do_fix() {
  info "Running fix..."
  cd "$INSTALL_DIR"
  node db/migrate.js && ok "Migrations OK." || warn "Migration issues."
  node db/seed.js && ok "Seed OK." || warn "Seed issues."
  pm2 restart "$PM2_NAME" 2>/dev/null || pm2 start ecosystem.config.js --env production
  ok "Fix complete."
  pm2 logs "$PM2_NAME" --lines 20 --nostream
}

do_set_admin() {
  echo -e ""
  read -rp "$(echo -e "${CYAN}  Enter Discord User ID to make admin: ${RESET}")" DISCORD_ID
  if [ -z "$DISCORD_ID" ]; then
    err "No Discord ID entered."
    return
  fi

  if [ ! -f "$INSTALL_DIR/.env" ]; then
    err ".env file not found at $INSTALL_DIR/.env"
    return
  fi

  DB_USER=$(grep "^DB_USER=" "$INSTALL_DIR/.env" | cut -d= -f2 | tr -d '[:space:]')
  DB_PASS=$(grep "^DB_PASSWORD=" "$INSTALL_DIR/.env" | cut -d= -f2 | tr -d '[:space:]')
  DB_NAME=$(grep "^DB_NAME=" "$INSTALL_DIR/.env" | cut -d= -f2 | tr -d '[:space:]')

  info "Connecting to database..."

  # Write temp mysql config to avoid password in command line
  MYSQL_CNF=$(mktemp)
  cat > "$MYSQL_CNF" <<EOF
[client]
user=${DB_USER}
password=${DB_PASS}
EOF
  chmod 600 "$MYSQL_CNF"

  mysql --defaults-file="$MYSQL_CNF" "$DB_NAME" -e "UPDATE users SET is_admin = 1 WHERE discord_id = '${DISCORD_ID}';" 2>/tmp/mysql_err

  if [ $? -ne 0 ]; then
    err "MySQL error: $(cat /tmp/mysql_err)"
    rm -f "$MYSQL_CNF"
    return
  fi

  ROWS=$(mysql --defaults-file="$MYSQL_CNF" "$DB_NAME" -se "SELECT COUNT(*) FROM users WHERE discord_id = '${DISCORD_ID}' AND is_admin = 1;" 2>/dev/null)
  rm -f "$MYSQL_CNF"

  if [ "$ROWS" = "1" ]; then
    ok "User $DISCORD_ID is now admin permanently!"
    info "No need to logout/login — admin status is saved in DB and won't be removed."
  else
    err "User not found. Make sure they have logged in at least once."
  fi
}

do_uninstall() {
  echo -e ""
  echo -e "${RED}${BOLD}  ⚠  WARNING: This will DELETE everything!${RESET}"
  echo -e "${RED}  Removes all files, database, PM2 process, and Nginx config.${RESET}"
  echo -e ""
  read -rp "$(echo -e "${YELLOW}  Type 'DELETE' to confirm: ${RESET}")" CONFIRM

  if [ "$CONFIRM" != "DELETE" ]; then
    warn "Cancelled."
    return
  fi

  info "Stopping PM2..."
  pm2 stop "$PM2_NAME" 2>/dev/null || true
  pm2 delete "$PM2_NAME" 2>/dev/null || true
  ok "PM2 process removed."

  if [ -f "$INSTALL_DIR/.env" ]; then
    DB_NAME=$(grep "^DB_NAME=" "$INSTALL_DIR/.env" | cut -d= -f2)
    DB_USER=$(grep "^DB_USER=" "$INSTALL_DIR/.env" | cut -d= -f2)
    DB_PASS=$(grep "^DB_PASSWORD=" "$INSTALL_DIR/.env" | cut -d= -f2)
    if [ -n "$DB_NAME" ]; then
      info "Dropping database..."
      mysql -u"$DB_USER" -p"$DB_PASS" -e "DROP DATABASE IF EXISTS \`${DB_NAME}\`;" 2>/dev/null || \
      mysql -uroot -e "DROP DATABASE IF EXISTS \`${DB_NAME}\`;" 2>/dev/null || true
      mysql -uroot -e "DROP USER IF EXISTS '${DB_USER}'@'localhost';" 2>/dev/null || true
      ok "Database removed."
    fi
  fi

  info "Removing Nginx config..."
  rm -f /etc/nginx/sites-enabled/freenode
  rm -f /etc/nginx/sites-available/freenode
  systemctl reload nginx 2>/dev/null || service nginx reload 2>/dev/null || true
  ok "Nginx config removed."

  info "Deleting project files..."
  rm -rf "$INSTALL_DIR"
  ok "All files deleted."

  echo -e ""
  echo -e "${GREEN}${BOLD}  ✔  Uninstall complete!${RESET}"
  echo -e "  To reinstall: ${CYAN}curl -sSL https://raw.githubusercontent.com/yuvrajnathawat/dashboard/main/freenode.sh | bash${RESET}"
  echo -e ""
}

# ─── Main Loop ────────────────────────────────
while true; do
  show_menu
  case "$CHOICE" in
    1)  do_install ;;
    2)  do_update ;;
    3)  do_rebuild ;;
    4)  do_start ;;
    5)  do_restart ;;
    6)  do_stop ;;
    7)  do_status ;;
    8)  do_logs ;;
    9)  do_fix ;;
    10) do_set_admin ;;
    11) do_uninstall ;;
    0)  echo -e "\n  Bye!\n"; exit 0 ;;
    *)  warn "Invalid option. Please select 0-11." ;;
  esac
  echo -e ""
  read -rp "$(echo -e "${CYAN}  Press Enter to return to menu...${RESET}")" _
done
