# Implementation Plan: FreeNode Dashboard

## Overview

Implement a server-rendered Node.js/Express web application wrapping Pterodactyl, with Discord OAuth2 auth, coin economy, AFK farming, earn links, redeem codes, shop, admin panel, expiry cron, Discord bot DM, and a one-command bash installer. All code is JavaScript (Node.js 18+).

## Tasks

- [x] 1. Project scaffolding and configuration
  - Create `package.json` with all required dependencies (`express`, `ejs`, `express-ejs-layouts`, `mysql2`, `passport`, `passport-discord`, `express-session`, `express-mysql-session`, `axios`, `node-cron`, `helmet`, `csurf`, `express-rate-limit`, `express-validator`, `morgan`, `connect-flash`, `dotenv`) and dev dependencies (`fast-check`, `jest`)
  - Create `server.js` as the HTTP entry point (loads `app.js`, binds to `PORT`)
  - Create `app.js` as the Express app factory (mounts all middleware and routers)
  - Create `ecosystem.config.js` with `max_memory_restart: '300M'`, `instances: 1`, `env_production: { NODE_ENV: 'production', PORT: 3000 }`
  - Create `.env.example` with all required environment variable keys and placeholder values
  - Create `.gitignore` excluding `.env`, `node_modules/`, and PM2 logs
  - _Requirements: 20.1, 20.2_

- [x] 2. Database layer — config, migration, and seed
  - [x] 2.1 Create `config/database.js` exporting a `mysql2` connection pool using env vars
    - _Requirements: 18.3_
  - [x] 2.2 Create `db/migrate.js` that creates all tables: `users`, `servers`, `coin_transactions`, `settings`, `shop_items`, `shop_purchases`, `earn_links`, `earn_completions`, `redeem_codes`, `redeem_uses`
    - Use `CREATE TABLE IF NOT EXISTS` with all columns, types, and constraints from the design
    - _Requirements: 2.6, 4.9, 6.4, 7.3, 8.7, 9.8, 10.5, 15.1_
  - [x] 2.3 Create `db/seed.js` that inserts all 12 default Settings keys if they do not already exist
    - Keys: `creation_cost`, `renewal_cost`, `renewal_period_days`, `deletion_grace_days`, `afk_coins_per_ping`, `afk_daily_limit`, `afk_captcha_interval_minutes`, `max_servers_per_user`, `default_ram_mb`, `default_cpu_percent`, `default_disk_mb`, `enabled_egg_ids`
    - _Requirements: 1.12, 16.5_

- [x] 3. Middleware
  - [x] 3.1 Create `config/session.js` exporting the `express-mysql-session` store and `express-session` config with `httpOnly: true`, `sameSite: 'lax'`, `secure` in production, 7-day `maxAge`
    - _Requirements: 18.4, 18.7_
  - [x] 3.2 Create `middleware/auth.js` exporting `isAuthenticated` (redirects to `/` if not logged in) and `isAdmin` (returns HTTP 403 if `req.user.is_admin` is false)
    - _Requirements: 11.7, 18.8_
  - [x] 3.3 Create `middleware/rateLimiter.js` exporting four named `express-rate-limit` instances: `authLimiter` (20/15 min), `afkLimiter` (2/70 sec), `earnLimiter` (10/1 hr), `redeemLimiter` (5/10 min)
    - _Requirements: 7.10, 8.9, 9.10, 18.5_
  - [x] 3.4 Create `middleware/csrf.js` that injects `res.locals.csrfToken` on GET requests and validates the token on POST/PUT/PATCH/DELETE
    - _Requirements: 18.2_
  - [ ]* 3.5 Write property test for admin route authorization
    - **Property 32: Admin route authorization**
    - **Validates: Requirements 11.7, 18.8**

- [x] 4. Pterodactyl service
  - [x] 4.1 Create `services/pterodactylService.js` with an axios instance (`timeout: 10000`) and implement all 13 operations: `createUser`, `deleteUser`, `createServer`, `suspendServer`, `unsuspendServer`, `deleteServer`, `reinstallServer`, `getServerDetails`, `getAllNodes`, `getAllNests`, `getAllEggs`, `getAvailableAllocations`, `getServerResourceUsage`
    - Use Application API key for all operations except `getServerResourceUsage` (Client API key)
    - Throw `PterodactylError { status, message, operation }` on 4xx/5xx responses
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5_
  - [ ]* 4.2 Write property test for Pterodactyl API key routing
    - **Property 38: Pterodactyl API key routing**
    - **Validates: Requirements 17.2**
  - [ ]* 4.3 Write property test for Pterodactyl structured error
    - **Property 39: Pterodactyl structured error**
    - **Validates: Requirements 17.3**

- [x] 5. Coin service
  - [x] 5.1 Create `services/coinService.js` implementing `credit`, `debit`, `getBalance`, `getTransactions`, `broadcastCredit`
    - All mutations use a DB transaction (BEGIN → UPDATE users.coins → INSERT coin_transactions → COMMIT, ROLLBACK on error)
    - `debit` throws `CoinError` if balance would go negative
    - _Requirements: 4.8, 5.4, 9.6, 10.4, 11.3, 15.1, 15.2_
  - [ ]* 5.2 Write property test for server creation coin atomicity
    - **Property 10: Server creation coin atomicity**
    - **Validates: Requirements 4.8, 4.11**
  - [ ]* 5.3 Write property test for renewal coin deduction and expiry extension
    - **Property 13: Renewal coin deduction and expiry extension**
    - **Validates: Requirements 5.2, 5.4, 5.5**
  - [ ]* 5.4 Write property test for coin broadcast credits all users
    - **Property 35: Coin broadcast credits all users**
    - **Validates: Requirements 15.2**
  - [ ]* 5.5 Write property test for admin coin adjustment transaction recording
    - **Property 29: Admin coin adjustment transaction recording**
    - **Validates: Requirements 11.3, 15.1**

- [x] 6. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Auth service and routes
  - [x] 7.1 Create `config/passport.js` configuring the `passport-discord` strategy with scopes `identify`, `guilds`, `guilds.members.read`; implement guild membership check, user upsert, and first-login Pterodactyl account creation
    - Sync `is_admin` flag from `ADMIN_DISCORD_IDS` env var on every login
    - Redirect suspended users to `/` with flash error
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.10_
  - [x] 7.2 Create `routes/auth.js` with GET `/auth/discord`, GET `/auth/discord/callback`, GET `/auth/logout`; apply `authLimiter` to all auth routes
    - _Requirements: 2.8, 2.9, 18.5_
  - [ ]* 7.3 Write property tests for auth service
    - **Property 1: New user record defaults** — Validates: Requirements 2.6
    - **Property 2: Returning user profile sync** — Validates: Requirements 2.7
    - **Property 3: Guild membership enforcement** — Validates: Requirements 2.3, 2.4
    - **Property 4: Logout invalidates session** — Validates: Requirements 2.9
    - **Property 5: Suspended user cannot authenticate** — Validates: Requirements 2.10

- [x] 8. AFK service and route
  - [x] 8.1 Create `services/afkService.js` implementing `handlePing(userId, sessionData)` and `verifyCaptcha(userId, token)`
    - Sum today's AFK `coin_transactions` to enforce `afk_daily_limit`
    - Track CAPTCHA state in session; set `captchaRequired: true` after `afk_captcha_interval_minutes` without a solve
    - Call `coinService.credit` only when under limit and no active CAPTCHA challenge
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9_
  - [x] 8.2 Create `routes/afk.js` with GET `/afk`, POST `/afk/ping` (apply `afkLimiter`), POST `/afk/captcha-verify`
    - _Requirements: 7.1, 7.10_
  - [ ]* 8.3 Write property tests for AFK service
    - **Property 17: AFK daily limit enforcement** — Validates: Requirements 7.2, 7.5
    - **Property 18: AFK coin credit amount** — Validates: Requirements 7.3
    - **Property 19: AFK CAPTCHA state machine** — Validates: Requirements 7.6, 7.7, 7.8, 7.9

- [x] 9. Earn service and route
  - [x] 9.1 Create `services/earnService.js` implementing `getLinksForUser(userId)`, `startEarn(userId, linkId)`, `verifyEarn(userId, linkId, token)`
    - Check `earn_completions` for active cooldown before redirecting
    - On valid token: call `coinService.credit`, insert `earn_completions` record
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8_
  - [x] 9.2 Create `routes/earn.js` with GET `/earn`, POST `/earn/:id/start` (apply `earnLimiter`), POST `/earn/:id/verify`
    - _Requirements: 8.9_
  - [ ]* 9.3 Write property tests for earn service
    - **Property 20: Earn link cooldown enforcement** — Validates: Requirements 8.2, 8.3
    - **Property 21: Earn coin credit and cooldown recording** — Validates: Requirements 8.6, 8.7
    - **Property 22: Earn invalid token rejects without credit** — Validates: Requirements 8.8

- [x] 10. Redeem service and route
  - [x] 10.1 Create `services/redeemService.js` implementing `redeem(userId, code)`
    - Case-insensitive code lookup; validate existence, expiry, max uses, per-user uniqueness
    - In a single DB transaction: `coinService.credit`, update user resource limits, increment `use_count`, insert `redeem_uses`
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9_
  - [x] 10.2 Create `routes/redeem.js` with GET `/redeem`, POST `/redeem` (apply `redeemLimiter`)
    - _Requirements: 9.10_
  - [ ]* 10.3 Write property tests for redeem service
    - **Property 23: Redeem code case-insensitive lookup** — Validates: Requirements 9.1
    - **Property 24: Redeem code validation failures** — Validates: Requirements 9.2, 9.3, 9.4, 9.5
    - **Property 25: Successful redemption atomicity** — Validates: Requirements 9.6, 9.7, 9.8

- [x] 11. Shop service and route
  - [x] 11.1 Create `services/shopService.js` implementing `getItems()` and `purchase(userId, itemId)`
    - `getItems` returns only `is_active = true` items
    - `purchase` uses DB transaction: debit coins → update user resource limit → insert `shop_purchases`; refund on failure
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_
  - [x] 11.2 Create `routes/shop.js` with GET `/shop`, POST `/shop/buy`
  - [ ]* 11.3 Write property tests for shop service
    - **Property 26: Shop only returns active items** — Validates: Requirements 10.1
    - **Property 27: Shop purchase coin and resource atomicity** — Validates: Requirements 10.2, 10.4, 10.5, 10.7

- [x] 12. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Server creation and renewal routes
  - [x] 13.1 Create `routes/server.js` with GET `/servers/create` and POST `/servers/create`
    - Validate slot limit, coin balance, enabled egg, resource allowance, available allocation using `express-validator`
    - Call `pterodactylService.createServer`; on success call `coinService.debit` and insert `servers` record
    - On Pterodactyl error: do NOT deduct coins; return error message
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11_
  - [x] 13.2 Add POST `/servers/:id/renew` to `routes/server.js`
    - Verify ownership, check coin balance, debit coins, extend `expires_at`, unsuspend if suspended
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_
  - [ ]* 13.3 Write property tests for server creation validation
    - **Property 6: Server creation slot validation** — Validates: Requirements 4.1
    - **Property 7: Server creation coin validation** — Validates: Requirements 4.2
    - **Property 8: Server creation egg validation** — Validates: Requirements 4.3
    - **Property 9: Server creation resource validation** — Validates: Requirements 4.4
    - **Property 11: Server record on creation** — Validates: Requirements 4.9
    - **Property 12: Renewal ownership check** — Validates: Requirements 5.1

- [x] 14. Expiry cron and Discord DM service
  - [x] 14.1 Create `services/discordService.js` implementing `sendDM(discordUserId, message)` using Discord REST API with `DISCORD_BOT_TOKEN`; fire-and-forget with error logging
    - _Requirements: 6.8_
  - [x] 14.2 Create `services/expiryService.js` with `node-cron` schedule `*/15 * * * *`
    - Query active servers past expiry → suspend via `pterodactylService` → update status to `suspended` → send Discord DM
    - Query suspended servers past grace period → delete via `pterodactylService` → remove DB record
    - On Pterodactyl error: log error with server ID and continue
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9_
  - [ ]* 14.3 Write property tests for expiry service
    - **Property 14: Expiry cron selects correct servers** — Validates: Requirements 6.2, 6.5
    - **Property 15: Expiry cron status update** — Validates: Requirements 6.4
    - **Property 16: Expiry cron error isolation** — Validates: Requirements 6.9

- [x] 15. Dashboard route
  - [x] 15.1 Create `routes/dashboard.js` with GET `/dashboard`
    - Fetch user's servers from DB, enrich with resource usage from `pterodactylService.getServerResourceUsage`
    - Compute quick stats: total servers, coins earned today, next expiry date
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 16. Admin routes
  - [x] 16.1 Create `routes/admin/users.js` — GET `/admin/users` (paginated, searchable), GET `/admin/users/:id`, POST `/admin/users/:id/coins`, POST `/admin/users/:id/suspend`, POST `/admin/users/:id/unsuspend`, DELETE `/admin/users/:id`
    - Suspend: set `is_suspended = true`; unsuspend: set `is_suspended = false`
    - Delete: remove user, cascade-delete servers, call `pterodactylService.deleteUser`
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_
  - [x] 16.2 Create `routes/admin/servers.js` — GET `/admin/servers` (paginated), POST suspend/unsuspend/delete/extend/reinstall
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_
  - [x] 16.3 Create `routes/admin/eggs.js` — GET `/admin/eggs`, POST enable/disable/defaults
    - Fetch nests and eggs from `pterodactylService`; persist enabled IDs and defaults to Settings
    - _Requirements: 13.1, 13.2, 13.3, 13.4_
  - [x] 16.4 Create `routes/admin/codes.js` — GET `/admin/codes`, POST create, POST bulk generate, POST deactivate
    - Bulk generate: produce N unique strings, insert all in one batch
    - Deactivate: set `max_uses = use_count`
    - _Requirements: 14.1, 14.2, 14.3, 14.4_
  - [x] 16.5 Create `routes/admin/coins.js` — GET `/admin/coins` (paginated transaction log), POST give/take, POST broadcast
    - _Requirements: 15.1, 15.2, 15.3_
  - [x] 16.6 Create `routes/admin/settings.js` — GET `/admin/settings`, POST save
    - Validate numeric fields are positive numbers and URL fields are valid URLs using `express-validator`
    - _Requirements: 16.1, 16.2, 16.3, 16.4_
  - [x] 16.7 Create `routes/admin/index.js` aggregating all admin sub-routers under `isAdmin` middleware; mount at `/admin` in `app.js`
    - _Requirements: 11.7, 18.8_
  - [ ]* 16.8 Write property tests for admin routes
    - **Property 28: Admin user search filtering** — Validates: Requirements 11.2
    - **Property 30: User suspend/unsuspend round trip** — Validates: Requirements 11.4, 11.5
    - **Property 31: User deletion cascades** — Validates: Requirements 11.6
    - **Property 33: Bulk code uniqueness** — Validates: Requirements 14.2
    - **Property 34: Code deactivation prevents redemption** — Validates: Requirements 14.3
    - **Property 36: Settings validation rejects invalid values** — Validates: Requirements 16.2, 16.3
    - **Property 37: Settings round trip** — Validates: Requirements 16.4

- [x] 17. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 18. EJS views and UI theme
  - [x] 18.1 Create `public/css/theme.css` with CSS custom properties (`--bg-primary: #0d0f14`, `--bg-card: #161922`, `--accent: #5865F2`, `--success: #57F287`, `--warning: #FEE75C`, `--danger: #ED4245`), font imports (Outfit, Plus Jakarta Sans, Inter), and page-specific accent overrides (`.page-afk`, `.page-shop`, `.page-earn`, `.page-redeem`)
    - _Requirements: 19.1, 19.2, 19.6_
  - [x] 18.2 Create `public/css/layout.css` with collapsible sidebar styles (`sidebar--collapsed`), top navbar, and responsive grid (320px–1920px, no horizontal scroll)
    - _Requirements: 19.3, 19.5_
  - [x] 18.3 Create `public/css/components.css` with `.card-glass` glassmorphism styles (`backdrop-filter: blur(12px)`, semi-transparent background, subtle border), button variants, form styles, and table styles
    - _Requirements: 19.4_
  - [x] 18.4 Create `public/js/sidebar.js` toggling `sidebar--collapsed` class and persisting state in `localStorage`
    - _Requirements: 19.3_
  - [x] 18.5 Create `public/js/afk.js` implementing the 60-second ping loop, CAPTCHA challenge UI display, and CAPTCHA form submission
    - _Requirements: 7.1, 7.6, 7.7_
  - [x] 18.6 Create EJS layouts: `views/layouts/auth.ejs` (centered card) and `views/layouts/main.ejs` (sidebar + navbar + flash partial)
  - [x] 18.7 Create EJS partials: `views/partials/sidebar.ejs`, `views/partials/navbar.ejs`, `views/partials/flash.ejs`
  - [x] 18.8 Create user-facing views: `views/index.ejs` (login), `views/dashboard.ejs`, `views/servers/create.ejs`, `views/afk.ejs`, `views/earn.ejs`, `views/redeem.ejs`, `views/shop.ejs`
    - Each view includes CSRF token hidden input on forms
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 19.1_
  - [x] 18.9 Create admin views: `views/admin/users.ejs`, `views/admin/servers.ejs`, `views/admin/eggs.ejs`, `views/admin/codes.ejs`, `views/admin/coins.ejs`, `views/admin/settings.ejs`
    - _Requirements: 11.1, 12.1, 13.1, 14.4, 15.3, 16.1_

- [x] 19. Wire everything together in `app.js`
  - [x] 19.1 Mount middleware stack in order: `morgan`, `helmet`, `express.static`, `express.urlencoded`, `express.json`, `session`, `passport.initialize`, `passport.session`, `connect-flash`, `csrf`, error handler
    - _Requirements: 18.1, 18.2, 20.4, 20.5_
  - [x] 19.2 Mount all routers: `routes/auth.js` at `/auth`, `routes/dashboard.js` at `/`, `routes/server.js` at `/servers`, `routes/afk.js` at `/afk`, `routes/earn.js` at `/earn`, `routes/redeem.js` at `/redeem`, `routes/shop.js` at `/shop`, `routes/admin/index.js` at `/admin`
  - [x] 19.3 Start `expiryService` cron when app initializes
  - [x] 19.4 Add production error middleware: log stack to PM2 log, render generic error view to client
    - _Requirements: 20.5_
  - [ ]* 19.5 Write property test for no API keys in responses
    - **Property 40: No API keys in responses**
    - **Validates: Requirements 17.4, 18.7**
  - [ ]* 19.6 Write property test for CSRF protection
    - **Property 41: CSRF protection on state-changing requests**
    - **Validates: Requirements 18.2**
  - [ ]* 19.7 Write property test for input validation
    - **Property 42: Input validation rejects malicious payloads**
    - **Validates: Requirements 18.6**

- [x] 20. Bash installer (`install.sh`)
  - [x] 20.1 Write `install.sh` with OS check (Ubuntu 20.04/22.04), Node 18+ check, MySQL/MariaDB check, PM2 check, Nginx check; exit 1 with descriptive message on any failure
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_
  - [x] 20.2 Add interactive prompts for all 10 config values; create MySQL database and user; write `.env` from `.env.example`
    - _Requirements: 1.7, 1.8, 1.9_
  - [x] 20.3 Add `npm install`, `node db/migrate.js`, `node db/seed.js`, `pm2 start ecosystem.config.js --env production`, `pm2 save`, `pm2 startup` steps
    - _Requirements: 1.10, 1.11, 1.12, 1.13, 20.3_
  - [x] 20.4 Add optional Nginx server block generation and reload; optional Certbot SSL invocation; print final summary with Dashboard URL, admin URL, and PM2 process name
    - _Requirements: 1.14, 1.15, 1.16, 1.17_

- [x] 21. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property tests use `fast-check` with a minimum of 100 iterations per property
- Unit tests and property tests live under `tests/unit/` and `tests/property/` respectively
- All DB mutations use parameterized queries via `mysql2`
- API keys are never passed to EJS templates or JSON responses
