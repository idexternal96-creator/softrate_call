const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    companyName: String,
    companyAddress: String,
    name: String,
    email: String,
    mobile: String,
    companyCode: String,
    teamSize: String,
    status: String,
    isApproved: Boolean,
    convertedPageStatuses: { type: [String], default: ['Converted'] },
  },
  {
    collection: 'users',
    timestamps: true,
    strict: false,
  }
);

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
