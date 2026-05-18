const CallLog = require('../../../models/CallLog');

function countCallLogs(filter) {
  return CallLog.countDocuments(filter);
}

module.exports = {
  countCallLogs,
};
