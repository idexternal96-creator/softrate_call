const Bookmark = require('../../../models/Bookmark');

function findFollowUps(filter, sort = { reminderDate: 1 }) {
  return Bookmark.find(filter).sort(sort).lean();
}

function createFollowUp(payload) {
  return Bookmark.create(payload);
}

module.exports = {
  findFollowUps,
  createFollowUp,
};
