const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const Razorpay = require('razorpay');
const User = require('../../../models/User');
const Payment = require('../../../models/Payment');

const router = express.Router();

// Team size → max headcount for pricing
const TEAM_SIZE_MAP = {
  '1-5': 5, '6-10': 10, '11-15': 15, '16-25': 25, '26-50': 50, '50+': 75,
};
const PRICE_PER_PERSON_PER_DAY = 10; // ₹10
const GST_PERCENTAGE = 18; // 18% GST

function getTeamSizeMax(teamSize) {
  if (!teamSize) return 10;
  if (TEAM_SIZE_MAP[teamSize]) return TEAM_SIZE_MAP[teamSize];
  const num = parseInt(teamSize);
  if (!isNaN(num)) return num;
  return 10;
}

/** Returns today's date as YYYY-MM-DD in IST */
function todayIST() {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().substring(0, 10);
}

/** Converts any Date to its YYYY-MM-DD calendar day in IST */
function toISTDateStr(date) {
  const ist = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().substring(0, 10);
}

/** Returns a Date for the START of a given YYYY-MM-DD date in IST */
function parseISTStart(dateStr) {
  return new Date(String(dateStr).substring(0, 10) + 'T00:00:00.000+05:30');
}

/** Returns a Date for the END of a given YYYY-MM-DD date in IST */
function parseISTEnd(dateStr) {
  return new Date(String(dateStr).substring(0, 10) + 'T23:59:59.999+05:30');
}

/** Adds N calendar days to a YYYY-MM-DD string, returns new YYYY-MM-DD */
function addDays(dateStr, n) {
  const [y, m, d] = String(dateStr).substring(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().substring(0, 10);
}

function getRazorpay() {
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
}

// Generate company code from name
function generateCompanyCode(name) {
  const clean = name.replace(/[^a-zA-Z0-9]/g, ' ').trim().toUpperCase();
  const words = clean.split(/\s+/);
  let base = '';
  if (words.length >= 3) base = (words[0][0] + words[1][0] + words[2][0]).toUpperCase();
  else if (words.length === 2 && words[0].length >= 2) base = (words[0][0] + words[0][1] + words[1][0]).toUpperCase();
  else if (words.length === 2) base = (words[0][0] + (words[1][0] || 'X') + (words[1][1] || 'X')).toUpperCase();
  else if (clean.length >= 3) base = clean.substring(0, 3).toUpperCase();
  else base = clean.padEnd(3, 'X').toUpperCase();
  const now = new Date();
  return `${base}-${String(now.getDate()).padStart(2,'0')}${String(now.getMonth()+1).padStart(2,'0')}-${now.getFullYear()}`;
}

/* ─────────────────────────────────────────────
   GET /api/payment/calculate
   Preview cost (no order created)
───────────────────────────────────────────── */
router.get('/calculate', async (req, res) => {
  try {
    const { teamSize, toDate, companyCode } = req.query;
    if (!teamSize || !toDate) {
      return res.status(400).json({ success: false, message: 'teamSize and toDate are required.' });
    }

    let fromDateStr = todayIST();

    // If companyCode provided, this is a renewal preview
    if (companyCode) {
      const user = await User.findOne({ companyCode: companyCode.toUpperCase() });
      if (user && user.subscriptionTo) {
        const subToStr = toISTDateStr(new Date(user.subscriptionTo));
        if (subToStr >= todayIST()) {
          // Still active → start from day AFTER subscription ends
          fromDateStr = addDays(subToStr, 1);
        }
        // else expired → fromDateStr stays as today
      }
    }

    const toDateStr = String(toDate).substring(0, 10);
    if (toDateStr <= fromDateStr) {
      return res.status(400).json({ success: false, message: 'Select a date after the current subscription ends.' });
    }

    const fromDate = parseISTStart(fromDateStr);
    const to      = parseISTEnd(toDateStr);
    const days = Math.ceil((to - fromDate) / (1000 * 60 * 60 * 24));
    const teamSizeMax = getTeamSizeMax(teamSize);
    const subtotalRupees = teamSizeMax * PRICE_PER_PERSON_PER_DAY * days;
    const taxRupees = Math.round(subtotalRupees * GST_PERCENTAGE) / 100;
    const totalRupees = subtotalRupees + taxRupees;

    return res.json({ 
      success: true, 
      fromDate, toDate: to, days, teamSize, teamSizeMax, 
      pricePerPersonPerDay: PRICE_PER_PERSON_PER_DAY,
      subtotalRupees,
      taxPercentage: GST_PERCENTAGE,
      taxRupees,
      amountRupees: totalRupees, 
      amountPaise: Math.round(totalRupees * 100)
    });
  } catch (err) {
    console.error('[payment/calculate]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});


/* ─────────────────────────────────────────────
   POST /api/payment/pre-order
   PAYMENT-FIRST FLOW:
   Takes full signup form + toDate, hashes password,
   creates a Razorpay order, stores form data in
   pendingSignup. NO account created yet.
───────────────────────────────────────────── */
router.post('/pre-order', async (req, res) => {
  try {
    const { companyName, companyAddress, name, email, password, countryCode, mobile, teamSize, industry, toDate } = req.body;

    if (!companyName || !name || !email || !password || !mobile || !teamSize || !industry || !toDate) {
      return res.status(400).json({ success: false, message: 'All fields including subscription end date are required.' });
    }

    // Check if email already registered
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email already registered.' });
    }

    const fromDate = new Date();
    fromDate.setHours(0, 0, 0, 0);
    const to = new Date(toDate);
    to.setHours(23, 59, 59, 999);

    if (to <= fromDate) {
      return res.status(400).json({ success: false, message: 'Subscription end date must be in the future.' });
    }

    const days = Math.ceil((to - fromDate) / (1000 * 60 * 60 * 24));
    const teamSizeMax = getTeamSizeMax(teamSize);
    const subtotalPaise = teamSizeMax * PRICE_PER_PERSON_PER_DAY * days * 100;
    const taxPaise = Math.round(subtotalPaise * (GST_PERCENTAGE / 100));
    const amountPaise = subtotalPaise + taxPaise;

    // Hash password to store temporarily
    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(password, salt);

    const razorpay = getRazorpay();
    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: `rcpt_${email.split('@')[0]}_${Date.now()}`,
      notes: { email, companyName, fromDate: fromDate.toISOString(), toDate: to.toISOString() },
    });

    // Store signup data + order in Payment record (pendingSignup)
    await Payment.create({
      razorpayOrderId: order.id,
      amount: amountPaise,
      fromDate,
      toDate: to,
      teamSize,
      teamSizeMax,
      pricePerPersonPerDay: PRICE_PER_PERSON_PER_DAY,
      days,
      subtotal: subtotalPaise,
      tax: taxPaise,
      taxPercentage: GST_PERCENTAGE,
      status: 'created',
      pendingSignup: { companyName, companyAddress, name, email: email.toLowerCase(), passwordHash, countryCode: countryCode || '+91', mobile, teamSize, industry },
    });

    return res.json({
      success: true,
      orderId: order.id,
      amount: amountPaise,
      amountRupees: amountPaise / 100,
      currency: 'INR',
      days,
      teamSizeMax,
      fromDate,
      toDate: to,
      keyId: process.env.RAZORPAY_KEY_ID,
      companyName,
      email,
      mobile,
    });
  } catch (err) {
    console.error('[payment/pre-order]', err);
    return res.status(500).json({ success: false, message: 'Failed to create payment order. ' + (err.message || '') });
  }
});

/* ─────────────────────────────────────────────
   POST /api/payment/verify
   Verifies Razorpay signature, fetches full
   payment details, THEN creates the account.
───────────────────────────────────────────── */
router.post('/verify', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: 'All payment fields are required.' });
    }

    // 1. Verify signature
    const expectedSig = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSig !== razorpay_signature) {
      await Payment.findOneAndUpdate({ razorpayOrderId: razorpay_order_id }, { status: 'failed' });
      return res.status(400).json({ success: false, message: 'Payment verification failed. Invalid signature.' });
    }

    // 2. Fetch full payment details from Razorpay
    const razorpay = getRazorpay();
    let rzpPayment = null;
    try {
      rzpPayment = await razorpay.payments.fetch(razorpay_payment_id);
    } catch (e) {
      console.warn('[verify] Could not fetch payment details:', e.message);
    }

    // 3. Extract useful fields
    const method = rzpPayment?.method || '';
    const bank = rzpPayment?.bank || rzpPayment?.issuer || '';
    const bankTxnId = rzpPayment?.acquirer_data?.bank_transaction_id || rzpPayment?.acquirer_data?.auth_code || '';
    const cardNetwork = rzpPayment?.card?.network || '';
    const cardLast4 = rzpPayment?.card?.last4 || '';
    const walletName = rzpPayment?.wallet || '';
    const vpa = rzpPayment?.vpa || '';

    // 4. Find the pending payment record
    const payment = await Payment.findOne({ razorpayOrderId: razorpay_order_id });
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment record not found.' });
    }

    const signup = payment.pendingSignup;
    if (!signup || !signup.email) {
      return res.status(400).json({ success: false, message: 'Signup data not found for this payment.' });
    }

    // 5. Create the User account now that payment is confirmed
    let baseCode = generateCompanyCode(signup.companyName);
    let finalCode = baseCode;
    let counter = 1;
    while (await User.findOne({ companyCode: finalCode })) {
      finalCode = baseCode + counter++;
    }

    const user = await User.create({
      companyName: signup.companyName,
      companyAddress: signup.companyAddress,
      companyCode: finalCode,
      name: signup.name,
      email: signup.email,
      password: signup.passwordHash,
      countryCode: signup.countryCode || '+91',
      mobile: signup.mobile,
      teamSize: signup.teamSize,
      industry: signup.industry,
      status: 'Paid',
      isApproved: true,
      subscriptionFrom: payment.fromDate,
      subscriptionTo: payment.toDate,
    });

    // 6. Update Payment record with full details + link to user
    await Payment.findByIdAndUpdate(payment._id, {
      companyCode: finalCode,
      userId: user._id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
      paymentMethod: method,
      bank,
      bankTransactionId: bankTxnId,
      cardNetwork,
      cardLast4,
      walletName,
      vpa,
      status: 'paid',
      pendingSignup: undefined,   // clear sensitive data
    });

    return res.json({
      success: true,
      message: 'Payment verified and account created successfully!',
      companyCode: finalCode,
      companyName: user.companyName,
      subscriptionFrom: payment.fromDate,
      subscriptionTo: payment.toDate,
      paymentDetails: {
        paymentId: razorpay_payment_id,
        orderId: razorpay_order_id,
        method,
        bank,
        bankTransactionId: bankTxnId,
        cardNetwork,
        cardLast4,
        walletName,
        vpa,
        amount: payment.amount / 100,
        currency: payment.currency,
      },
    });
  } catch (err) {
    console.error('[payment/verify]', err);
    return res.status(500).json({ success: false, message: 'Server error during verification.' });
  }
});

/* ─────────────────────────────────────────────
   POST /api/payment/verify-renewal (for logged-in renewals)
───────────────────────────────────────────── */
router.post('/verify-renewal', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, companyCode } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !companyCode) {
      return res.status(400).json({ success: false, message: 'All payment fields are required.' });
    }

    const expectedSig = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex');

    if (expectedSig !== razorpay_signature) {
      await Payment.findOneAndUpdate({ razorpayOrderId: razorpay_order_id }, { status: 'failed' });
      return res.status(400).json({ success: false, message: 'Payment verification failed.' });
    }

    const razorpay = getRazorpay();
    let rzpPayment = null;
    try { rzpPayment = await razorpay.payments.fetch(razorpay_payment_id); } catch (e) {}

    const method = rzpPayment?.method || '';
    const bank = rzpPayment?.bank || rzpPayment?.issuer || '';
    const bankTxnId = rzpPayment?.acquirer_data?.bank_transaction_id || '';
    const cardNetwork = rzpPayment?.card?.network || '';
    const cardLast4 = rzpPayment?.card?.last4 || '';
    const walletName = rzpPayment?.wallet || '';
    const vpa = rzpPayment?.vpa || '';

    const payment = await Payment.findOneAndUpdate(
      { razorpayOrderId: razorpay_order_id },
      { razorpayPaymentId: razorpay_payment_id, razorpaySignature: razorpay_signature, paymentMethod: method, bank, bankTransactionId: bankTxnId, cardNetwork, cardLast4, walletName, vpa, status: 'paid' },
      { returnDocument: 'after' }
    );
    if (!payment) return res.status(404).json({ success: false, message: 'Payment record not found.' });

    const user = await User.findOneAndUpdate(
      { companyCode },
      { status: 'Paid', isApproved: true, subscriptionFrom: payment.fromDate, subscriptionTo: payment.toDate },
      { returnDocument: 'after' }
    );

    return res.json({
      success: true, message: 'Subscription renewed!',
      subscriptionFrom: payment.fromDate, subscriptionTo: payment.toDate, companyCode,
      paymentDetails: { paymentId: razorpay_payment_id, orderId: razorpay_order_id, method, bank, bankTransactionId: bankTxnId, cardNetwork, cardLast4, walletName, vpa, amount: payment.amount / 100 },
    });
  } catch (err) {
    console.error('[payment/verify-renewal]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

/* ─────────────────────────────────────────────
   POST /api/payment/renew
───────────────────────────────────────────── */
router.post('/renew', async (req, res) => {
  try {
    const { companyCode, toDate } = req.body;
    if (!companyCode || !toDate) return res.status(400).json({ success: false, message: 'companyCode and toDate are required.' });

    const user = await User.findOne({ companyCode });
    if (!user) return res.status(404).json({ success: false, message: 'Company not found.' });

    const todayStr = todayIST();
    let fromDateStr = todayStr;

    if (user.subscriptionTo) {
      const subToStr = toISTDateStr(new Date(user.subscriptionTo));
      if (subToStr >= todayStr) {
        // Subscription still active → start from the day AFTER it ends
        fromDateStr = addDays(subToStr, 1);
      }
      // else expired → fromDateStr stays as today
    }

    const toDateStr = String(toDate).substring(0, 10);
    const fromDate = parseISTStart(fromDateStr);
    const to       = parseISTEnd(toDateStr);

    const days = Math.ceil((to - fromDate) / (1000 * 60 * 60 * 24));

    const teamSizeMax = getTeamSizeMax(user.teamSize);
    const subtotalPaise = teamSizeMax * PRICE_PER_PERSON_PER_DAY * days * 100;
    const taxPaise = Math.round(subtotalPaise * (GST_PERCENTAGE / 100));
    const amountPaise = subtotalPaise + taxPaise;

    const razorpay = getRazorpay();
    const order = await razorpay.orders.create({
      amount: amountPaise, currency: 'INR',
      receipt: `renew_${companyCode}_${Date.now()}`,
      notes: { companyCode, fromDate: fromDate.toISOString(), toDate: to.toISOString() },
    });

    await Payment.create({
      companyCode, userId: user._id, razorpayOrderId: order.id,
      amount: amountPaise, fromDate, toDate: to,
      teamSize: user.teamSize, teamSizeMax, pricePerPersonPerDay: PRICE_PER_PERSON_PER_DAY, days, 
      subtotal: subtotalPaise, tax: taxPaise, taxPercentage: GST_PERCENTAGE,
      status: 'created',
    });

    return res.json({
      success: true, orderId: order.id, amount: amountPaise, amountRupees: amountPaise / 100, currency: 'INR',
      days, teamSizeMax, fromDate, toDate: to, keyId: process.env.RAZORPAY_KEY_ID,
      companyName: user.companyName, email: user.email, mobile: user.mobile,
    });
  } catch (err) {
    console.error('[payment/renew]', err);
    return res.status(500).json({ success: false, message: 'Failed to create renewal order. ' + (err.message || '') });
  }
});

/* ─────────────────────────────────────────────
   GET /api/payment/history/:companyCode
───────────────────────────────────────────── */
router.get('/history/:companyCode', async (req, res) => {
  try {
    const companyCode = req.params.companyCode.toUpperCase();
    const payments = await Payment.find({ companyCode }).sort({ createdAt: -1 });
    return res.json({ success: true, payments, keyId: process.env.RAZORPAY_KEY_ID });
  } catch (err) {
    console.error('[payment/history]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

/* ─────────────────────────────────────────────
   DELETE /api/payment/order/:id
───────────────────────────────────────────── */
router.delete('/order/:id', async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ success: false, message: 'Payment record not found.' });

    // Only allow deleting unpaid orders
    if (payment.status !== 'created') {
      return res.status(400).json({ success: false, message: 'Only unpaid orders can be deleted.' });
    }

    await Payment.findByIdAndDelete(req.params.id);
    return res.json({ success: true, message: 'Order deleted successfully.' });
  } catch (err) {
    console.error('[payment/delete-order]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
