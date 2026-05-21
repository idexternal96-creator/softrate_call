const { mapSettingsDocument } = require('./settings.mapper');
const repository = require('./settings.repository');

async function getSettings(companyCode) {
  const document = await repository.findSettings(companyCode);
  return mapSettingsDocument(document || {});
}

async function saveSettings(companyCode, settings) {
  const document = await repository.updateSettings(companyCode, settings);
  return mapSettingsDocument(document || settings);
}

module.exports = {
  getSettings,
  saveSettings,
};
