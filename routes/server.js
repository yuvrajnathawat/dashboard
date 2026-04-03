'use strict';

const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { isAuthenticated } = require('../middleware/auth');
const pterodactylService = require('../services/pterodactylService');
const coinService = require('../services/coinService');
const pool = require('../config/database');

const router = express.Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Fetch a setting value by key from the settings table.
 * @param {string} key
 * @returns {Promise<string|null>}
 */
async function getSetting(key) {
  const [rows] = await pool.execute(
    'SELECT value FROM settings WHERE `key` = ?',
    [key]
  );
  return rows.length ? rows[0].value : null;
}

// ─── GET /servers/create ──────────────────────────────────────────────────────

router.get('/create', isAuthenticated, async (req, res) => {
  try {
    // Fetch enabled egg IDs from settings
    const enabledRaw = await getSetting('enabled_egg_ids');
    const enabledEggIds = JSON.parse(enabledRaw || '[]');

    // Fetch all nests, then collect egg details for enabled IDs
    const nests = await pterodactylService.getAllNests();
    const eggs = [];

    for (const nest of nests) {
      const nestEggs = await pterodactylService.getAllEggs(nest.attributes.id);
      for (const egg of nestEggs) {
        if (enabledEggIds.includes(egg.attributes.id)) {
          eggs.push(egg);
        }
      }
    }

    const nodes = await pterodactylService.getAllNodes();
    const creationCost = Number(await getSetting('creation_cost') || 0);

    return res.render('servers/create', {
      user: req.user,
      eggs,
      nodes,
      creationCost,
      errors: [],
    });
  } catch (err) {
    console.error('Server create page error:', err);
    return res.status(500).render('error', { message: 'Internal server error' });
  }
});

// ─── POST /servers/create ─────────────────────────────────────────────────────

router.post(
  '/create',
  isAuthenticated,
  [
    body('name')
      .trim()
      .isLength({ min: 3, max: 32 })
      .withMessage('Server name must be between 3 and 32 characters.')
      .matches(/^[a-zA-Z0-9-]+$/)
      .withMessage('Server name may only contain letters, numbers, and dashes.'),
    body('egg_id')
      .toInt()
      .isInt({ min: 1 })
      .withMessage('A valid egg must be selected.'),
    body('node_id')
      .toInt()
      .isInt({ min: 1 })
      .withMessage('A valid node must be selected.'),
  ],
  async (req, res) => {
    // Re-render helper — fetches form data again and renders with errors
    async function reRenderWithErrors(errors) {
      try {
        const enabledRaw = await getSetting('enabled_egg_ids');
        const enabledEggIds = JSON.parse(enabledRaw || '[]');
        const nests = await pterodactylService.getAllNests();
        const eggs = [];
        for (const nest of nests) {
          const nestEggs = await pterodactylService.getAllEggs(nest.attributes.id);
          for (const egg of nestEggs) {
            if (enabledEggIds.includes(egg.attributes.id)) eggs.push(egg);
          }
        }
        const nodes = await pterodactylService.getAllNodes();
        const creationCost = Number(await getSetting('creation_cost') || 0);
        return res.status(422).render('servers/create', {
          user: req.user,
          eggs,
          nodes,
          creationCost,
          errors,
        });
      } catch (innerErr) {
        console.error('Re-render error:', innerErr);
        return res.status(500).render('error', { message: 'Internal server error' });
      }
    }

    // 1. express-validator errors
    const validationErrors = validationResult(req);
    if (!validationErrors.isEmpty()) {
      return reRenderWithErrors(validationErrors.array().map((e) => e.msg));
    }

    const { name, egg_id: eggId, node_id: nodeId } = req.body;
    const userId = req.user.id;

    try {
      // 2. Load settings
      const [
        creationCostRaw,
        maxServersRaw,
        renewalPeriodRaw,
        enabledRaw,
      ] = await Promise.all([
        getSetting('creation_cost'),
        getSetting('max_servers_per_user'),
        getSetting('renewal_period_days'),
        getSetting('enabled_egg_ids'),
      ]);

      const creationCost = Number(creationCostRaw || 0);
      const maxServers = Number(maxServersRaw || 2);
      const renewalPeriodDays = Number(renewalPeriodRaw || 7);
      const enabledEggIds = JSON.parse(enabledRaw || '[]');

      // 3. Check server slot limit
      const [serverCountRows] = await pool.execute(
        "SELECT COUNT(*) AS cnt FROM servers WHERE user_id = ? AND status != 'deleted'",
        [userId]
      );
      const serverCount = Number(serverCountRows[0].cnt);
      if (serverCount >= maxServers) {
        return reRenderWithErrors([
          `You have reached your maximum server limit of ${maxServers}.`,
        ]);
      }

      // 4. Check coin balance
      const balance = await coinService.getBalance(userId);
      if (balance < creationCost) {
        return reRenderWithErrors([
          `Insufficient coins. You need ${creationCost} coins but have ${balance}.`,
        ]);
      }

      // 5. Check egg is enabled
      if (!enabledEggIds.includes(Number(eggId))) {
        return reRenderWithErrors(['The selected egg is not available.']);
      }

      // 6. Get available allocations for the node
      const allocations = await pterodactylService.getAvailableAllocations(Number(nodeId));
      if (!allocations || allocations.length === 0) {
        return reRenderWithErrors([
          'No available allocations on the selected node. Please choose a different node.',
        ]);
      }
      const allocation = allocations[0];
      const allocationId = allocation.attributes.id;

      // 6b. Fetch egg details to get docker_image and startup command
      let eggDockerImage = '';
      let eggStartup = '';
      let eggEnvironment = {};
      try {
        const nests = await pterodactylService.getAllNests();
        for (const nest of nests) {
          const nestEggs = await pterodactylService.getAllEggs(nest.attributes.id);
          const matchedEgg = nestEggs.find((e) => e.attributes.id === Number(eggId));
          if (matchedEgg) {
            eggDockerImage = matchedEgg.attributes.docker_image || '';
            eggStartup = matchedEgg.attributes.startup || '';
            // Build environment from egg variables using their default values
            if (matchedEgg.attributes.relationships && matchedEgg.attributes.relationships.variables) {
              for (const v of matchedEgg.attributes.relationships.variables.data) {
                eggEnvironment[v.attributes.env_variable] = v.attributes.default_value || '';
              }
            }
            break;
          }
        }
      } catch (eggErr) {
        console.error('Failed to fetch egg details:', eggErr);
      }

      // 7. Calculate already-used resources
      const [usedRows] = await pool.execute(
        "SELECT COALESCE(SUM(ram_mb),0) AS used_ram, COALESCE(SUM(cpu_percent),0) AS used_cpu, COALESCE(SUM(disk_mb),0) AS used_disk FROM servers WHERE user_id = ? AND status != 'deleted'",
        [userId]
      );
      const usedRam = Number(usedRows[0].used_ram);
      const usedCpu = Number(usedRows[0].used_cpu);
      const usedDisk = Number(usedRows[0].used_disk);

      const remainingRam = req.user.max_ram_mb - usedRam;
      const remainingCpu = req.user.max_cpu_percent - usedCpu;
      const remainingDisk = req.user.max_disk_mb - usedDisk;

      // 8. Determine resource values from egg defaults or user remaining limits
      const eggDefaultsRaw = await getSetting(`egg_defaults_${eggId}`);
      let ramMb, cpuPercent, diskMb;

      if (eggDefaultsRaw) {
        const eggDefaults = JSON.parse(eggDefaultsRaw);
        ramMb = eggDefaults.ram_mb || remainingRam;
        cpuPercent = eggDefaults.cpu_percent || remainingCpu;
        diskMb = eggDefaults.disk_mb || remainingDisk;
      } else {
        // Fall back to global defaults from settings
        const [defaultRamRaw, defaultCpuRaw, defaultDiskRaw] = await Promise.all([
          getSetting('default_ram_mb'),
          getSetting('default_cpu_percent'),
          getSetting('default_disk_mb'),
        ]);
        ramMb = Math.min(Number(defaultRamRaw || 1024), remainingRam);
        cpuPercent = Math.min(Number(defaultCpuRaw || 100), remainingCpu);
        diskMb = Math.min(Number(defaultDiskRaw || 5120), remainingDisk);
      }

      // 9. Check remaining resources are sufficient
      if (ramMb <= 0 || cpuPercent <= 0 || diskMb <= 0) {
        return reRenderWithErrors([
          'You do not have enough remaining resource allowance to create a server.',
        ]);
      }

      // 10. Build Pterodactyl server creation payload
      const serverPayload = {
        name,
        user: req.user.ptero_user_id,
        egg: Number(eggId),
        docker_image: eggDockerImage,
        startup: eggStartup,
        environment: eggEnvironment,
        limits: {
          memory: ramMb,
          swap: 0,
          disk: diskMb,
          io: 500,
          cpu: cpuPercent,
        },
        feature_limits: {
          databases: 0,
          backups: 0,
        },
        allocation: {
          default: allocationId,
        },
      };

      // 11. Create server on Pterodactyl (do NOT deduct coins yet)
      let pteroServer;
      try {
        pteroServer = await pterodactylService.createServer(serverPayload);
      } catch (pteroErr) {
        console.error('Pterodactyl createServer error:', pteroErr);
        return reRenderWithErrors([
          `Failed to create server: ${pteroErr.message}`,
        ]);
      }

      const pteroServerId = pteroServer.attributes.id;
      const pteroServerUuid = pteroServer.attributes.uuid;

      // 12. Deduct coins only after successful Pterodactyl creation
      await coinService.debit(userId, creationCost, 'server_create');

      // 13. Calculate expires_at
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + renewalPeriodDays);

      // 14. Insert server record
      await pool.execute(
        `INSERT INTO servers
          (ptero_server_id, ptero_server_uuid, user_id, name, egg_id, node_id, allocation_id, ram_mb, cpu_percent, disk_mb, status, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
        [
          pteroServerId,
          pteroServerUuid,
          userId,
          name,
          Number(eggId),
          Number(nodeId),
          allocationId,
          ramMb,
          cpuPercent,
          diskMb,
          expiresAt,
        ]
      );

      // 15. Redirect with success flash
      req.flash('success', `Server "${name}" created successfully!`);
      return res.redirect('/dashboard');
    } catch (err) {
      console.error('Server creation error:', err);
      return reRenderWithErrors(['An unexpected error occurred. Please try again.']);
    }
  }
);

// ─── GET /servers/:id/panel ───────────────────────────────────────────────────

router.get('/:id/panel', isAuthenticated, async (req, res) => {
  const serverId = Number(req.params.id);
  const userId = req.user.id;

  const [rows] = await pool.execute(
    'SELECT * FROM servers WHERE id = ? AND user_id = ?',
    [serverId, userId]
  );
  if (!rows.length) return res.status(404).render('error', { message: 'Server not found.' });

  const panelUrl = `${process.env.PTERODACTYL_URL}/server/${rows[0].ptero_server_uuid}`;
  return res.redirect(panelUrl);
});

// ─── POST /servers/:id/reset-password ────────────────────────────────────────

router.post(
  '/:id/reset-password',
  isAuthenticated,
  [param('id').toInt().isInt({ min: 1 })],
  async (req, res) => {
    const paramErrors = validationResult(req);
    if (!paramErrors.isEmpty()) return res.status(400).json({ error: 'Invalid server ID.' });

    const serverId = Number(req.params.id);
    const userId = req.user.id;

    try {
      // Verify ownership
      const [rows] = await pool.execute(
        'SELECT * FROM servers WHERE id = ? AND user_id = ?',
        [serverId, userId]
      );
      if (!rows.length) return res.status(404).json({ error: 'Server not found.' });

      // Generate a random 16-char password
      const newPassword = require('crypto').randomBytes(8).toString('hex');

      // Update on Pterodactyl
      await pterodactylService.resetUserPassword(req.user.ptero_user_id, req.user.discord_id, newPassword);

      return res.json({ success: true, password: newPassword });
    } catch (err) {
      console.error('Reset password error:', err);
      return res.status(500).json({ error: 'Failed to reset password.' });
    }
  }
);

// ─── POST /servers/:id/renew ──────────────────────────────────────────────────

router.post(
  '/:id/renew',
  isAuthenticated,
  [
    param('id').toInt().isInt({ min: 1 }).withMessage('Invalid server ID.'),
  ],
  async (req, res) => {
    const paramErrors = validationResult(req);
    if (!paramErrors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid server ID.' });
    }

    const serverId = Number(req.params.id);
    const userId = req.user.id;

    try {
      // 1. Ownership check
      const [serverRows] = await pool.execute(
        'SELECT * FROM servers WHERE id = ? AND user_id = ?',
        [serverId, userId]
      );
      if (!serverRows.length) {
        return res.status(404).json({ error: 'Server not found.' });
      }
      const server = serverRows[0];

      // 2. Load renewal settings
      const [renewalCostRaw, renewalPeriodRaw] = await Promise.all([
        getSetting('renewal_cost'),
        getSetting('renewal_period_days'),
      ]);
      const renewalCost = Number(renewalCostRaw || 50);
      const renewalPeriodDays = Number(renewalPeriodRaw || 7);

      // 3. Check coin balance
      const balance = await coinService.getBalance(userId);
      if (balance < renewalCost) {
        return res.status(400).json({
          error: `Insufficient coins. You need ${renewalCost} coins but have ${balance}.`,
        });
      }

      // 4. Debit coins
      await coinService.debit(userId, renewalCost, 'server_renew');

      // 5. Calculate new expiry: MAX(current expires_at, NOW()) + renewal_period_days
      const now = new Date();
      const currentExpiry = new Date(server.expires_at);
      const baseDate = currentExpiry > now ? currentExpiry : now;
      const newExpiry = new Date(baseDate);
      newExpiry.setDate(newExpiry.getDate() + renewalPeriodDays);

      // 6. Update server record
      await pool.execute(
        "UPDATE servers SET expires_at = ?, status = 'active' WHERE id = ?",
        [newExpiry, serverId]
      );

      // 7. Unsuspend if server was suspended
      if (server.status === 'suspended') {
        try {
          await pterodactylService.unsuspendServer(server.ptero_server_id);
        } catch (pteroErr) {
          console.error('Unsuspend error during renewal:', pteroErr);
          // Non-fatal: expiry was already extended, log and continue
        }
      }

      return res.json({ success: true, new_expiry: newExpiry });
    } catch (err) {
      console.error('Server renewal error:', err);
      return res.status(500).json({ error: 'An unexpected error occurred.' });
    }
  }
);

module.exports = router;
