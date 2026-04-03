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
      async (accessToken, refreshToken, profile, done) => {
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

          // Determine admin status from env var
          const adminIds = process.env.ADMIN_DISCORD_IDS
            ? process.env.ADMIN_DISCORD_IDS.split(',').map((id) => id.trim())
            : [];
          const isAdmin = adminIds.includes(profile.id) ? 1 : 0;

          // 2. Look up existing user
          const [rows] = await pool.query(
            'SELECT * FROM users WHERE discord_id = ?',
            [profile.id]
          );

          if (rows.length > 0) {
            // 3. Returning user — update profile and admin flag
            const user = rows[0];

            await pool.query(
              'UPDATE users SET username = ?, avatar = ?, is_admin = ? WHERE id = ?',
              [profile.username, profile.avatar || null, isAdmin, user.id]
            );

            if (user.is_suspended) {
              return done(null, false, {
                message: 'Your account has been suspended.',
              });
            }

            // Return updated user object
            return done(null, {
              ...user,
              username: profile.username,
              avatar: profile.avatar || null,
              is_admin: isAdmin,
            });
          }

          // 4. First login — create new user
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

          // Generate random password for Pterodactyl account
          const password = crypto.randomBytes(16).toString('hex');

          // Try to create Pterodactyl account — non-fatal if it fails
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

          // Insert new user into DB
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

          const newUser = {
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
          };

          return done(null, newUser);
        } catch (err) {
          return done(err);
        }
      }
    )
  );

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id, done) => {
    try {
      const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
      if (rows.length === 0) {
        return done(null, null);
      }

      const user = rows[0];

      // Re-check admin status from env var on every session load
      const adminIds = process.env.ADMIN_DISCORD_IDS
        ? process.env.ADMIN_DISCORD_IDS.split(',').map((id) => id.trim())
        : [];
      const isAdmin = adminIds.includes(user.discord_id) ? 1 : 0;

      // Update DB if admin status changed
      if (user.is_admin !== isAdmin) {
        await pool.query('UPDATE users SET is_admin = ? WHERE id = ?', [isAdmin, user.id]);
        user.is_admin = isAdmin;
      }

      done(null, user);
    } catch (err) {
      done(err);
    }
  });
};
