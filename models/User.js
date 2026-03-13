const mongoose = require('mongoose');

const TEAM_SIZE_OPTIONS = ['1-5', '6-10', '11-15', '16-25', '26-50', '50+'];
const INDUSTRY_OPTIONS = [
  'IT / ITES',
  'BPO / KPO',
  'Banking & Finance',
  'Healthcare',
  'Retail & E-commerce',
  'Manufacturing',
  'Telecom',
  'Education',
  'Real Estate',
  'Other',
];

const userSchema = new mongoose.Schema(
  {
    companyName: {
      type: String,
      required: [true, 'Company name is required'],
      trim: true,
    },
    companyAddress: {
      type: String,
      trim: true,
    },
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
    },
    countryCode: {
      type: String,
      required: [true, 'Country code is required'],
      trim: true,
      default: '+91'
    },
    mobile: {
      type: String,
      required: [true, 'Mobile number is required'],
      trim: true,
    },
    companyCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true
    },
    teamSize: {
      type: String,
      required: [true, 'Team size is required'],
    },
    industry: {
      type: String,
      enum: INDUSTRY_OPTIONS,
      required: [true, 'Industry is required'],
    },
    status: {
      type: String,
      enum: ['Free-Trial-Request', 'Free-Trial', 'Paid', 'On due'],
      default: 'Free-Trial-Request',
    },
    isApproved: {
      type: Boolean,
      default: false,
    },
    trialStartDate: {
      type: Date,
    },
    tags: [{
      type: String,
      trim: true
    }],
    relationshipManager: {
      name: { type: String, trim: true },
      phone: { type: String, trim: true },
      email: { type: String, trim: true },
      workingDays: { type: String, trim: true },
      workingHours: { type: String, trim: true }
    },
    rmRequestTime: {
      type: Date
    }
  },
  {
    timestamps: true, // adds createdAt & updatedAt automatically
  }
);

module.exports = mongoose.model('User', userSchema);
module.exports.INDUSTRY_OPTIONS = INDUSTRY_OPTIONS;
module.exports.INDUSTRY_OPTIONS = INDUSTRY_OPTIONS;
