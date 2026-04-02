'use strict';

require('dotenv').config();
const pool = require('../config/database');

const defaults = [
  { key: 'creation_cost',                value: '100'  },
  { key: 'renewal_cost',                 value: '50'   },
  { key: 'renewal_period_days',          value: '7'    },
  { key: 'deletion_grace_days',          value: '3'    },
  { key: 'afk_coins_per_ping',           value: '1'    },
  { key: 'afk_daily_limit',             value: '100'  },
  { key: 'afk_captcha_interval_minutes', value: '10'   },
  { key: 'max_servers_per_user',         value: '2'    },
  { key: 'default_ram_mb',              value: '1024' },
  { key: 'default_cpu_percent',         value: '100'  },
  { key: 'default_disk_mb',             value: '5120' },
  { key: 'enabled_egg_ids',             value: '[]'   },
];

async function seed() {
  for (const { key, value } of defaults) {
    await pool.query(
      'INSERT IGNORE INTO settings (`key`, value) VALUES (?, ?)',
      [key, value]
    );
    console.log(`Seeded: ${key}`);
  }
  console.log('Seeding complete.');
  await pool.end();
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seeding failed:', err.message);
  process.exit(1);
});
