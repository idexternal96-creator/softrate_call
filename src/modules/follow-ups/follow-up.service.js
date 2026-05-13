const { mapFollowUpDocument } = require('./follow-up.mapper');
const repository = require('./follow-up.repository');

async function listFollowUps(filter, sort) {
  const documents = await repository.findFollowUps(filter, sort);
  return documents.map(mapFollowUpDocument);
}

module.exports = {
  listFollowUps,
};
