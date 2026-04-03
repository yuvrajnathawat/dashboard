#!/bin/bash

# ─────────────────────────────────────────────
#  FreeNode Dashboard — Management Script
#  Usage: bash manage.sh [command]
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

INSTALL_DIR="/opt/freenode-dashboard"
PM2_NAME="freenode-dashboard"

banner() {
  echo -e ""
  echo -e "${CYAN}${BOLD}╔══════════════════════════════════════════════╗${RESET}"
  echo -e "${CYAN}${BOLD}║    FreeNode Dashboard  —  Manager            ║${RESET}"
  echo -e "${CYAN}${BOLD}╚══════════════════════════════════════════════╝${RESET}"
  echo -e ""
}

usage() {
  banner
  echo -e "  ${BOLD}Usage:${RESET} bash manage.sh [command]"
  echo -e ""
  echo -e "  ${BOLD}Commands:${RESET}"
  echo -e "  ${GREEN}start${RESET}      — Start the dashboard"
  echo -e "  ${GREEN}stop${RESET}       — Stop the dashboard"
  echo -e "  ${GREEN}restart${RESET}    — Restart the dashboard"
  echo -e "  ${GREEN}status${RESET}     — Show PM2 status"
  echo -e "  ${GREEN}logs${RESET}       — Show live logs"
  echo -e "  ${GREEN}update${RESET}     — Pull latest changes from GitHub and restart"
  echo -e "  ${GREEN}rebuild${RESET}    — Full rebuild (pull + npm install + restart)"
  echo -e "  ${GREEN}fix${RESET}        — Fix common errors (re-run migrations + restart)"
  echo -e "  ${GREEN}delete${RESET}     — DELETE everything and start fresh"
  echo -e ""
}

cmd_start() {
  info "Starting FreeNode Dashboard..."
  cd "$INSTALL_DIR"
  pm2 start ecosystem.config.js --env production 2>/dev/null || pm2 restart "$PM2_NAME"
  ok "Dashboard started."
  pm2 status
}

cmd_stop() {
  info "Stopping FreeNode Dashboard..."
  pm2 stop "$PM2_NAME" 2>/dev/null || true
  ok "Dashboard stopped."
}

cmd_restart() {
  info "Restarting FreeNode Dashboard..."
  pm2 restart "$PM2_NAME" 2>/dev/null || cmd_start
  ok "Dashboard restarted."
}

cmd_status() {
  pm2 status
}

cmd_logs() {
  pm2 logs "$PM2_NAME" --lines 100
}

cmd_update() {
  banner
  info "Pulling latest changes from GitHub..."
  cd "$INSTALL_DIR"
  git pull --ff-only 2>/dev/null || git pull
  ok "Code updated."
  info "Restarting dashboard..."
  pm2 restart "$PM2_NAME" 2>/dev/null || cmd_start
  ok "Dashboard restarted with latest code."
  pm2 status
}

cmd_rebuild() {
  banner
  info "Pulling latest changes from GitHub..."
  cd "$INSTALL_DIR"
  git pull --ff-only 2>/dev/null || git pull
  ok "Code updated."
  info "Installing dependencies..."
  npm install --production
  ok "Dependencies installed."
  info "Running migrations..."
  node db/migrate.js
  ok "Migrations complete."
  info "Restarting dashboard..."
  pm2 restart "$PM2_NAME" 2>/dev/null || pm2 start ecosystem.config.js --env production
  pm2 save
  ok "Rebuild complete."
  pm2 status
}

cmd_fix() {
  banner
  info "Running fix — re-running migrations and restarting..."
  cd "$INSTALL_DIR"
  info "Running migrations..."
  node db/migrate.js && ok "Migrations OK." || warn "Migration had issues — check logs."
  info "Running seed..."
  node db/seed.js && ok "Seed OK." || warn "Seed had issues."
  info "Restarting dashboard..."
  pm2 restart "$PM2_NAME" 2>/dev/null || pm2 start ecosystem.config.js --env production
  pm2 save
  ok "Fix complete."
  echo -e ""
  info "Last 30 log lines:"
  pm2 logs "$PM2_NAME" --lines 30 --nostream
}

cmd_delete() {
  banner
  echo -e "${RED}${BOLD}  ⚠  WARNING: This will DELETE everything!${RESET}"
  echo -e "${RED}  This removes all dashboard files, the database, and PM2 process.${RESET}"
  echo -e ""
  read -rp "$(echo -e "${YELLOW}  Type 'DELETE' to confirm: ${RESET}")" CONFIRM

  if [ "$CONFIRM" != "DELETE" ]; then
    warn "Cancelled. Nothing was deleted."
    exit 0
  fi

  info "Stopping PM2 process..."
  pm2 stop "$PM2_NAME" 2>/dev/null || true
  pm2 delete "$PM2_NAME" 2>/dev/null || true
  ok "PM2 process removed."

  # Remove database
  if [ -f "$INSTALL_DIR/.env" ]; then
    DB_NAME=$(grep "^DB_NAME=" "$INSTALL_DIR/.env" | cut -d= -f2)
    DB_USER=$(grep "^DB_USER=" "$INSTALL_DIR/.env" | cut -d= -f2)
    if [ -n "$DB_NAME" ]; then
      info "Dropping database '$DB_NAME'..."
      mysql -uroot -e "DROP DATABASE IF EXISTS \`${DB_NAME}\`;" 2>/dev/null || true
      mysql -uroot -e "DROP USER IF EXISTS '${DB_USER}'@'localhost';" 2>/dev/null || true
      ok "Database removed."
    fi
  fi

  info "Removing Nginx config..."
  rm -f /etc/nginx/sites-enabled/freenode
  rm -f /etc/nginx/sites-available/freenode
  nginx -t 2>/dev/null && (systemctl reload nginx 2>/dev/null || service nginx reload 2>/dev/null || true)
  ok "Nginx config removed."

  info "Deleting project files..."
  rm -rf "$INSTALL_DIR"
  ok "Project files deleted."

  echo -e ""
  echo -e "${GREEN}${BOLD}  ✔  Everything deleted. Run the installer to start fresh:${RESET}"
  echo -e "  ${CYAN}curl -sSL https://raw.githubusercontent.com/yuvrajnathawat/dashboard/main/install.sh | bash${RESET}"
  echo -e ""
}

# ─── Main ─────────────────────────────────────
case "${1:-}" in
  start)   cmd_start ;;
  stop)    cmd_stop ;;
  restart) cmd_restart ;;
  status)  cmd_status ;;
  logs)    cmd_logs ;;
  update)  cmd_update ;;
  rebuild) cmd_rebuild ;;
  fix)     cmd_fix ;;
  delete)  cmd_delete ;;
  *)       usage ;;
esac
