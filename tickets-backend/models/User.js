const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    companyName: String,
    name: String,
    email: String,
    mobile: String,
    companyCode: String,
    status: String,
    convertedPageStatuses: { type: [String], default: ['Converted'] },
  },
  {
    collection: 'users',
    timestamps: true,
    strict: false,
  }
);

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
