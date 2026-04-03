'use strict';

require('dotenv').config();
const pool = require('../config/database');

const tables = [
  {
    name: 'users',
    sql: `CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      discord_id VARCHAR(20) UNIQUE NOT NULL,
      username VARCHAR(100) NOT NULL,
      avatar VARCHAR(100),
      ptero_user_id INT,
      coins BIGINT DEFAULT 0,
      max_servers INT DEFAULT 2,
      max_ram_mb INT DEFAULT 1024,
      max_cpu_percent INT DEFAULT 100,
      max_disk_mb INT DEFAULT 5120,
      is_admin BOOLEAN DEFAULT FALSE,
      is_suspended BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
  },
  {
    name: 'servers',
    sql: `CREATE TABLE IF NOT EXISTS servers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ptero_server_id INT UNIQUE NOT NULL,
      ptero_server_uuid VARCHAR(36),
      user_id INT NOT NULL,
      name VARCHAR(100),
      egg_id INT,
      node_id INT,
      allocation_id INT,
      ram_mb INT,
      cpu_percent INT,
      disk_mb INT,
      status ENUM('active','suspended','deleted') DEFAULT 'active',
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
  },
  {
    name: 'coin_transactions',
    sql: `CREATE TABLE IF NOT EXISTS coin_transactions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      actor_id INT NULL,
      amount INT NOT NULL,
      reason VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
  },
  {
    name: 'settings',
    sql: `CREATE TABLE IF NOT EXISTS settings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      \`key\` VARCHAR(128) UNIQUE NOT NULL,
      value TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
  },
  {
    name: 'shop_items',
    sql: `CREATE TABLE IF NOT EXISTS shop_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      description TEXT,
      coin_cost INT NOT NULL,
      resource_type ENUM('ram','cpu','disk','servers') NOT NULL,
      resource_amount INT NOT NULL,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: 'shop_purchases',
    sql: `CREATE TABLE IF NOT EXISTS shop_purchases (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      item_id INT NOT NULL,
      coins_spent INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (item_id) REFERENCES shop_items(id)
    )`,
  },
  {
    name: 'earn_links',
    sql: `CREATE TABLE IF NOT EXISTS earn_links (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      url VARCHAR(500) NOT NULL,
      coin_reward INT NOT NULL,
      cooldown_seconds INT DEFAULT 86400,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: 'earn_completions',
    sql: `CREATE TABLE IF NOT EXISTS earn_completions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      link_id INT NOT NULL,
      completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (link_id) REFERENCES earn_links(id) ON DELETE CASCADE
    )`,
  },
  {
    name: 'redeem_codes',
    sql: `CREATE TABLE IF NOT EXISTS redeem_codes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(64) UNIQUE NOT NULL,
      coin_reward INT DEFAULT 0,
      resource_bonuses JSON NULL,
      max_uses INT NULL,
      use_count INT DEFAULT 0,
      expires_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: 'redeem_uses',
    sql: `CREATE TABLE IF NOT EXISTS redeem_uses (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code_id INT NOT NULL,
      user_id INT NOT NULL,
      used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_user_code (user_id, code_id),
      FOREIGN KEY (code_id) REFERENCES redeem_codes(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
  },
  {
    name: 'announcements',
    sql: `CREATE TABLE IF NOT EXISTS announcements (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(200) NOT NULL,
      type ENUM('banner','video','promotion') NOT NULL DEFAULT 'banner',
      content TEXT,
      embed_url VARCHAR(500),
      link_url VARCHAR(500),
      link_text VARCHAR(100),
      position ENUM('top','dashboard','sidebar') NOT NULL DEFAULT 'dashboard',
      is_active BOOLEAN DEFAULT TRUE,
      sort_order INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  },
];

async function migrate() {
  for (const table of tables) {
    console.log(`Creating table: ${table.name}...`);
    await pool.query(table.sql);
    console.log(`  ✓ ${table.name}`);
  }
  console.log('Migration complete.');
  await pool.end();
  process.exit(0);
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
