'use strict';

const axios = require('axios');

// Structured error for Pterodactyl API failures
class PterodactylError extends Error {
  constructor(status, message, operation) {
    super(message);
    this.name = 'PterodactylError';
    this.status = status;
    this.message = message;
    this.operation = operation;
  }
}

// Shared axios config
const axiosConfig = {
  timeout: 10000,
  baseURL: process.env.PTERODACTYL_URL,
};

// Application API instance (admin operations)
const appApi = axios.create({
  ...axiosConfig,
  headers: {
    Authorization: `Bearer ${process.env.PTERODACTYL_APP_API_KEY}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
});

// Client API instance (resource usage queries)
const clientApi = axios.create({
  ...axiosConfig,
  headers: {
    Authorization: `Bearer ${process.env.PTERODACTYL_CLIENT_API_KEY}`,
    Accept: 'application/json',
  },
});

// Response interceptor factory — throws PterodactylError on 4xx/5xx
function addErrorInterceptor(instance, operationContext) {
  instance.interceptors.response.use(
    (response) => response,
    (error) => {
      const status = error.response ? error.response.status : 0;
      const pteroMessage =
        error.response &&
        error.response.data &&
        error.response.data.errors &&
        error.response.data.errors[0]
          ? error.response.data.errors[0].detail || error.response.data.errors[0].code
          : error.message;
      // operation will be set per-call; use context label as fallback
      throw new PterodactylError(status, pteroMessage, operationContext || 'unknown');
    }
  );
}

addErrorInterceptor(appApi, 'appApi');
addErrorInterceptor(clientApi, 'clientApi');

// Helper: wrap a call and re-throw with the correct operation name
async function call(fn, operation) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof PterodactylError) {
      err.operation = operation;
    }
    throw err;
  }
}

// ─── Application API operations ──────────────────────────────────────────────

/**
 * Create a Pterodactyl user account.
 * @returns {Object} user data from Pterodactyl
 */
async function createUser(email, username, firstName, lastName, password) {
  return call(async () => {
    const res = await appApi.post('/api/application/users', {
      email,
      username,
      first_name: firstName,
      last_name: lastName,
      password,
    });
    return res.data;
  }, 'createUser');
}

/**
 * Delete a Pterodactyl user by their panel user ID.
 */
async function deleteUser(pteroUserId) {
  return call(async () => {
    await appApi.delete(`/api/application/users/${pteroUserId}`);
  }, 'deleteUser');
}

/**
 * Update server build limits (memory, cpu, disk, etc.)
 * @param {number} serverId - Pterodactyl server ID
 * @param {object} limits - { memory, cpu, disk, swap, io }
 */
async function updateServerBuild(serverId, limits) {
  return call(async () => {
    await appApi.patch(`/api/application/servers/${serverId}/build`, {
      allocation: limits.allocation,
      memory: limits.memory,
      swap: limits.swap || 0,
      disk: limits.disk,
      io: limits.io || 500,
      cpu: limits.cpu,
      feature_limits: { databases: 0, backups: 0 },
    });
  }, 'updateServerBuild');
}

/**
 * Create a server on the Pterodactyl panel.
 * @param {Object} opts - Full server creation payload
 * @returns {Object} server data from Pterodactyl
 */
async function createServer(opts) {
  return call(async () => {
    const res = await appApi.post('/api/application/servers', opts);
    return res.data;
  }, 'createServer');
}

/**
 * Suspend a server by its panel server ID.
 */
async function suspendServer(serverId) {
  return call(async () => {
    await appApi.post(`/api/application/servers/${serverId}/suspend`);
  }, 'suspendServer');
}

/**
 * Unsuspend a server by its panel server ID.
 */
async function unsuspendServer(serverId) {
  return call(async () => {
    await appApi.post(`/api/application/servers/${serverId}/unsuspend`);
  }, 'unsuspendServer');
}

/**
 * Delete a server by its panel server ID.
 */
async function deleteServer(serverId) {
  return call(async () => {
    await appApi.delete(`/api/application/servers/${serverId}`);
  }, 'deleteServer');
}

/**
 * Trigger a reinstall for a server by its panel server ID.
 */
async function reinstallServer(serverId) {
  return call(async () => {
    await appApi.post(`/api/application/servers/${serverId}/reinstall`);
  }, 'reinstallServer');
}

/**
 * Get full details for a server by its panel server ID.
 * @returns {Object} server data from Pterodactyl
 */
async function getServerDetails(serverId) {
  return call(async () => {
    const res = await appApi.get(`/api/application/servers/${serverId}`);
    return res.data;
  }, 'getServerDetails');
}

/**
 * Get all nodes (up to 100).
 * @returns {Array} array of node objects
 */
async function getAllNodes() {
  return call(async () => {
    const res = await appApi.get('/api/application/nodes?per_page=100');
    return res.data.data;
  }, 'getAllNodes');
}

/**
 * Get all nests (up to 100).
 * @returns {Array} array of nest objects
 */
async function getAllNests() {
  return call(async () => {
    const res = await appApi.get('/api/application/nests?per_page=100');
    return res.data.data;
  }, 'getAllNests');
}

/**
 * Get all eggs for a given nest, including variables.
 * @returns {Array} array of egg objects
 */
async function getAllEggs(nestId) {
  return call(async () => {
    const res = await appApi.get(
      `/api/application/nests/${nestId}/eggs?include=variables`
    );
    return res.data.data;
  }, 'getAllEggs');
}

/**
 * Get all unassigned (available) allocations for a node.
 * @returns {Array} array of unassigned allocation objects
 */
async function getAvailableAllocations(nodeId) {
  return call(async () => {
    const res = await appApi.get(
      `/api/application/nodes/${nodeId}/allocations?per_page=100`
    );
    return res.data.data.filter((a) => !a.attributes.assigned);
  }, 'getAvailableAllocations');
}

// ─── Client API operations ────────────────────────────────────────────────────

/**
 * Reset a Pterodactyl user's password by their panel user ID.
 * Pterodactyl PATCH requires email, username, first_name alongside password.
 * @param {number} pteroUserId
 * @param {string} discordId  - used as username and to build email
 * @param {string} newPassword
 */
async function resetUserPassword(pteroUserId, discordId, newPassword) {
  return call(async () => {
    // First fetch current user data so we don't lose any required fields
    const userRes = await appApi.get(`/api/application/users/${pteroUserId}`);
    const u = userRes.data.attributes;
    await appApi.patch(`/api/application/users/${pteroUserId}`, {
      email: u.email,
      username: u.username,
      first_name: u.first_name,
      last_name: u.last_name,
      password: newPassword,
    });
  }, 'resetUserPassword');
}

/**
 * Get resource usage for a server by its UUID.
 * @returns {{ current_state: string, resources: Object }}
 */
async function getServerResourceUsage(serverUuid) {
  return call(async () => {
    const res = await clientApi.get(
      `/api/client/servers/${serverUuid}/resources`
    );
    const { current_state, resources } = res.data.attributes;
    return { current_state, resources };
  }, 'getServerResourceUsage');
}

module.exports = {
  PterodactylError,
  createUser,
  deleteUser,
  resetUserPassword,
  createServer,
  updateServerBuild,
  suspendServer,
  unsuspendServer,
  deleteServer,
  reinstallServer,
  getServerDetails,
  getAllNodes,
  getAllNests,
  getAllEggs,
  getAvailableAllocations,
  getServerResourceUsage,
};
