'use strict';

const DiscordStrategy = require('passport-discord').Strategy;
const crypto = require('crypto');
const pool = require('./database');
const pterodactylService = require('../services/pterodactylService');

module.exports = function (passport) {
  passport.use(
    new DiscordStrategy(
      {
        clientID: process.env.DISCORD_CLIENT_ID,
        clientSecret: process.env.DISCORD_CLIENT_SECRET,
        callbackURL: process.env.DISCORD_CALLBACK_URL,
        scope: ['identify', 'guilds'],
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          // 1. Guild membership check
          if (process.env.REQUIRED_GUILD_ID) {
            const guilds = profile.guilds || [];
            const inGuild = guilds.some((g) => g.id === process.env.REQUIRED_GUILD_ID);
            if (!inGuild) {
              return done(null, false, {
                message: 'You must be in our Discord server to use this panel.',
              });
            }
          }

          // 2. Look up existing user
          const [rows] = await pool.query(
            'SELECT * FROM users WHERE discord_id = ?',
            [profile.id]
          );

          if (rows.length > 0) {
            const user = rows[0];

            if (user.is_suspended) {
              return done(null, false, { message: 'Your account has been suspended.' });
            }

            // Update username and avatar
            await pool.query(
              'UPDATE users SET username = ?, avatar = ? WHERE id = ?',
              [profile.username, profile.avatar || null, user.id]
            );

            // If ptero_user_id is missing, try to create it now
            let pteroUserId = user.ptero_user_id;
            if (!pteroUserId) {
              try {
                const password = crypto.randomBytes(16).toString('hex');
                const pteroData = await pterodactylService.createUser(
                  `${profile.id}@freenode.local`,
                  profile.id,
                  profile.username,
                  'User',
                  password
                );
                pteroUserId = pteroData.attributes ? pteroData.attributes.id : pteroData.id;
                await pool.query('UPDATE users SET ptero_user_id = ? WHERE id = ?', [pteroUserId, user.id]);
                console.log(`[passport] Created missing Pterodactyl user for ${profile.username}: ${pteroUserId}`);
              } catch (pteroErr) {
                console.warn('[passport] Pterodactyl createUser retry failed:', pteroErr.message);
              }
            }

            return done(null, {
              ...user,
              username: profile.username,
              avatar: profile.avatar || null,
              ptero_user_id: pteroUserId,
            });
          }

          // 3. First login — check if this Discord ID is in ADMIN_DISCORD_IDS env
          const adminIds = process.env.ADMIN_DISCORD_IDS
            ? process.env.ADMIN_DISCORD_IDS.split(',').map((id) => id.trim())
            : [];
          const isAdmin = adminIds.includes(profile.id) ? 1 : 0;

          // Get default settings
          const [settingRows] = await pool.query(
            "SELECT `key`, value FROM settings WHERE `key` IN ('default_ram_mb', 'default_cpu_percent', 'default_disk_mb', 'max_servers_per_user')"
          );

          const settings = {};
          for (const row of settingRows) {
            settings[row.key] = parseInt(row.value, 10);
          }

          const defaultRam = settings.default_ram_mb || 1024;
          const defaultCpu = settings.default_cpu_percent || 100;
          const defaultDisk = settings.default_disk_mb || 5120;
          const maxServers = settings.max_servers_per_user || 2;

          const password = crypto.randomBytes(16).toString('hex');

          let pteroUserId = null;
          try {
            const pteroData = await pterodactylService.createUser(
              `${profile.id}@freenode.local`,
              profile.id,
              profile.username,
              'User',
              password
            );
            pteroUserId = pteroData.attributes ? pteroData.attributes.id : pteroData.id;
          } catch (pteroErr) {
            console.warn('[passport] Pterodactyl createUser failed (non-fatal):', pteroErr.message);
          }

          const [result] = await pool.query(
            `INSERT INTO users
              (discord_id, username, avatar, ptero_user_id, coins, max_servers, max_ram_mb, max_cpu_percent, max_disk_mb, is_admin)
             VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
            [
              profile.id,
              profile.username,
              profile.avatar || null,
              pteroUserId,
              maxServers,
              defaultRam,
              defaultCpu,
              defaultDisk,
              isAdmin,
            ]
          );

          return done(null, {
            id: result.insertId,
            discord_id: profile.id,
            username: profile.username,
            avatar: profile.avatar || null,
            ptero_user_id: pteroUserId,
            coins: 0,
            max_servers: maxServers,
            max_ram_mb: defaultRam,
            max_cpu_percent: defaultCpu,
            max_disk_mb: defaultDisk,
            is_admin: isAdmin,
            is_suspended: 0,
          });
        } catch (err) {
          return done(err);
        }
      }
    )
  );

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  // Deserialize — always read fresh from DB, never override is_admin
  passport.deserializeUser(async (id, done) => {
    try {
      const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
      done(null, rows[0] || null);
    } catch (err) {
      done(err);
    }
  });
};
