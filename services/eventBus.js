/**
 * eventBus.js
 * In-memory SSE client registry.
 * Supports emitting events to a specific employee or entire company.
 */

// Map<"companyCode_phone", Set<res>>
const clients = new Map();

function _key(companyCode, phone) {
  return `${companyCode}__${phone}`;
}

/**
 * Register a new SSE response for an employee.
 */
function addClient(companyCode, phone, res) {
  const k = _key(companyCode, phone);
  if (!clients.has(k)) clients.set(k, new Set());
  clients.get(k).add(res);
  console.log(`[SSE] Client connected: ${k} (total: ${clients.get(k).size})`);
}

/**
 * Remove an SSE response (called on connection close).
 */
function removeClient(companyCode, phone, res) {
  const k = _key(companyCode, phone);
  const set = clients.get(k);
  if (set) {
    set.delete(res);
    if (set.size === 0) clients.delete(k);
  }
  console.log(`[SSE] Client disconnected: ${k}`);
}

/**
 * Send an event to one specific employee.
 */
function emitToEmployee(companyCode, phone, data) {
  const k = _key(companyCode, phone);
  const set = clients.get(k);
  if (!set || set.size === 0) return;
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of set) {
    try { res.write(payload); } catch (e) { set.delete(res); }
  }
}

/**
 * Send an event to ALL employees of a company.
 */
function emitToCompany(companyCode, data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const [k, set] of clients) {
    if (k.startsWith(`${companyCode}__`)) {
      for (const res of set) {
        try { res.write(payload); } catch (e) { set.delete(res); }
      }
    }
  }
}

module.exports = { addClient, removeClient, emitToEmployee, emitToCompany };
