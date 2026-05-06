const History = require('../models/History');

/**
 * Logs a change to the history collection.
 * @param {Object} data - The history record data.
 * @param {string} data.companyCode
 * @param {string} data.contactNumber
 * @param {string} [data.contactName]
 * @param {string} [data.companyName]
 * @param {string} data.action
 * @param {any} [data.oldValue]
 * @param {any} [data.newValue]
 * @param {string} [data.details]
 * @param {string} [data.changedBy]
 */
const logChange = async (data) => {
  try {
    const history = new History(data);
    await history.save();
    return history;
  } catch (err) {
    console.error('[historyService] Error logging change:', err);
    // We don't throw error to avoid breaking the main request flow
    return null;
  }
};

module.exports = {
  logChange
};
