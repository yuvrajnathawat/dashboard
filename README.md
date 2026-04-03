# SoloCloud Dashboard

A free game & bot server hosting dashboard built on top of Pterodactyl Panel. Users login with Discord, earn coins via AFK farming and tasks, and use them to create and manage servers.

## Features

- Discord OAuth2 login
- Coin economy — AFK farming, earn links, redeem codes, shop
- Server management — create, renew, delete (resources freed back to account)
- Shop — buy RAM, CPU, Disk, server slots with optional per-server upgrade
- Admin panel — manage users, servers, eggs, shop items, earn links, announcements, branding
- Announcements — banners, video embeds, promotions shown across the dashboard
- Full branding control — site name, logo, favicon, background image
- Responsive — works on phone, tablet, laptop, desktop

## Requirements

- Ubuntu 20.04 / 22.04 / 24.04
- Pterodactyl Panel (with Application + Client API keys)
- Discord Application (OAuth2 + Bot)
- Domain with DNS pointed to your VPS

## Installation

One command install:

```bash
curl -sSL https://raw.githubusercontent.com/yuvrajnathawat/dashboard/main/freenode.sh | bash
```

This opens an interactive menu:

```
╔══════════════════════════════════════════════╗
║      SoloCloud Dashboard  —  Menu            ║
╚══════════════════════════════════════════════╝

  1) Install          — Fresh install from GitHub
  2) Update           — Pull latest changes + restart
  3) Rebuild          — Full rebuild (npm install + migrate)
  4) Start            — Start the dashboard
  5) Restart          — Restart the dashboard
  6) Stop             — Stop the dashboard
  7) Status           — Show PM2 status
  8) Logs             — Show live logs
  9) Fix              — Fix errors (re-migrate + restart)
 10) Set Admin        — Make a Discord user admin
 11) Uninstall        — Remove EVERYTHING
  0) Exit
```

Select **1** for a fresh install. It will ask for:

1. Pterodactyl Panel URL
2. Pterodactyl Application API Key (`ptla_...`)
3. Pterodactyl Client API Key (`ptlc_...`)
4. Discord Client ID
5. Discord Client Secret
6. Discord Bot Token
7. Discord Server (Guild) ID *(optional — leave blank to allow all)*
8. Dashboard URL (e.g. `https://free.yourdomain.com`)
9. MySQL root password
10. Database name

Then automatically installs Node.js, MariaDB, PM2, Nginx, and SSL.

## After Install

1. Visit your dashboard URL and login with Discord
2. Go to `/admin/settings` to set your site name, logo, favicon, and background
3. Go to `/admin/eggs` to enable server types
4. Go to `/admin/shop` to add purchasable resource upgrades
5. Go to `/admin/earn` to add earn links for users

## Management

```bash
# Re-open the management menu anytime
curl -sSL https://raw.githubusercontent.com/yuvrajnathawat/dashboard/main/freenode.sh | bash

# Or if already downloaded
bash /opt/freenode.sh
```

## Made By

Made by **Yuvraj** — [yuvrajnathawat03@gmail.com](mailto:yuvrajnathawat03@gmail.com)

For support or questions, reach out via email.
