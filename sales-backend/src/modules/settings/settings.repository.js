const User = require('../../../models/User');

function findSettings(companyCode) {
  return User.findOne({ companyCode }).lean();
}

function updateSettings(companyCode, settings) {
  return User.findOneAndUpdate({ companyCode }, { $set: settings }, { new: true }).lean();
}

module.exports = {
  findSettings,
  updateSettings,
};
