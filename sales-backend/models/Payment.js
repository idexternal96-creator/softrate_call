const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    companyCode: { type: String, uppercase: true },   // set after account created
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // set after account created

    razorpayOrderId:   { type: String, required: true, unique: true },
    razorpayPaymentId: { type: String },
    razorpaySignature: { type: String },

    // Full payment details fetched from Razorpay after verification
    paymentMethod:           { type: String }, // card, upi, netbanking, wallet
    bank:                    { type: String }, // bank name
    bankTransactionId:       { type: String }, // acquirer transaction ID
    cardNetwork:             { type: String }, // Visa, Mastercard etc.
    cardLast4:               { type: String },
    walletName:              { type: String },
    vpa:                     { type: String }, // UPI VPA

    // Amount in paise (₹1 = 100 paise)
    amount:   { type: Number, required: true },
    currency: { type: String, default: 'INR' },

    fromDate: { type: Date, required: true },
    toDate:   { type: Date, required: true },

    teamSize:              { type: String },
    teamSizeMax:           { type: Number },
    pricePerPersonPerDay:  { type: Number, default: 10 },
    days:                  { type: Number },
    subtotal:              { type: Number }, // in paise
    tax:                   { type: Number }, // in paise
    taxPercentage:         { type: Number, default: 18 },

    status: {
      type: String,
      enum: ['created', 'paid', 'failed'],
      default: 'created',
    },

    // Stores signup form data temporarily until payment succeeds
    pendingSignup: {
      companyName:    { type: String },
      companyAddress: { type: String },
      name:           { type: String },
      email:          { type: String },
      passwordHash:   { type: String },   // bcrypt hash stored here
      countryCode:    { type: String },
      mobile:         { type: String },
      teamSize:       { type: String },
      industry:       { type: String },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Payment', paymentSchema);
