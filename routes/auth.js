const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { notifyAdminOfRequest, notifyAdminOfRmRequest } = require('../services/mailService');

const router = express.Router();

// Password strength validator
// Must have: min 8 chars, 1 uppercase, 1 number, 1 symbol
function isStrongPassword(pwd) {
  return /^(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/.test(pwd);
}

// Generate a 3-letter company code + date (e.g., SOG-1003-2026)
function generateCompanyCode(name) {
  const clean = name.replace(/[^a-zA-Z0-9]/g, ' ').trim().toUpperCase();
  const words = clean.split(/\s+/);
  let base = '';
  if (words.length >= 3) {
    base = (words[0][0] + words[1][0] + words[2][0]).toUpperCase();
  } else if (words.length === 2 && words[0].length >= 2) {
    base = (words[0][0] + words[0][1] + words[1][0]).toUpperCase(); 
  } else if (words.length === 2) {
    base = (words[0][0] + (words[1][0] || 'X') + (words[1][1] || 'X')).toUpperCase();
  } else if (clean.length >= 3) {
    base = clean.substring(0, 3).toUpperCase();
  } else {
    base = clean.padEnd(3, 'X').toUpperCase();
  }
  
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  
  return `${base}-${dd}${mm}-${yyyy}`;
}

/* ─────────────────────────────────────────────
   POST /api/auth/register
───────────────────────────────────────────── */
router.post('/register', async (req, res) => {
  try {
    const { companyName, companyAddress, name, email, password, countryCode, mobile, teamSize, industry } = req.body;

    // --- Validation ---
    if (!companyName || !name || !email || !password || !mobile || !teamSize || !industry) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        success: false,
        message:
          'Password must be at least 8 characters and include an uppercase letter, a number, and a symbol.',
      });
    }

    // --- Check duplicate email ---
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email already registered.' });
    }

    // --- Hash password ---
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    // --- Generate Unique Company Code ---
    let baseCode = generateCompanyCode(companyName);
    let finalCode = baseCode;
    let counter = 1;
    while (await User.findOne({ companyCode: finalCode })) {
      finalCode = baseCode + counter;
      counter++;
    }

    // --- Create user ---
    const { isTrial } = req.body;
    const user = await User.create({
      companyName,
      companyAddress,
      companyCode: finalCode,
      name,
      email,
      password: hashedPassword,
      countryCode: countryCode || '+91',
      mobile,
      teamSize,
      industry,
      status: isTrial ? 'Free-Trial-Request' : 'Paid',
      isApproved: isTrial ? false : true
    });

    // Notify Admin
    await notifyAdminOfRequest(user);

    return res.status(201).json({
      success: true,
      message: 'Account created successfully.',
      userId: user._id,
      companyCode: user.companyCode
    });
  } catch (err) {
    console.error('[register]', err);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

/* ─────────────────────────────────────────────
   POST /api/auth/login
───────────────────────────────────────────── */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: 'Invalid email or password.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res
        .status(401)
        .json({ success: false, message: 'Invalid email or password.' });
    }

    // --- Check Account Status ---
    if (user.status === 'Free-Trial-Request' || !user.isApproved) {
      return res.status(403).json({
        success: false,
        message: 'Your account is pending approval from the main admin.',
        status: user.status
      });
    }

    if (user.status === 'On due') {
      return res.status(403).json({
        success: false,
        message: 'Your trial period has expired. Please contact support to upgrade to a paid plan.',
        status: user.status
      });
    }

    // Check if trial has expired (secondary check during login)
    if (user.status === 'Free-Trial' && user.trialStartDate) {
      const now = new Date();
      const diffTime = Math.abs(now - user.trialStartDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays > 7) {
        user.status = 'On due';
        await user.save();
        return res.status(403).json({
          success: false,
          message: 'Your 7-day trial period has expired.',
          status: 'On due'
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        companyName: user.companyName,
        companyCode: user.companyCode,
        companyAddress: user.companyAddress || '',
        status: user.status,
        isApproved: user.isApproved,
        teamSize: user.teamSize
      },
    });
  } catch (err) {
    console.error('[login]', err);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

/* ─────────────────────────────────────────────
   GET /api/auth/company/:companyCode
───────────────────────────────────────────── */
router.get('/company/:companyCode', async (req, res) => {
  try {
    const { companyCode } = req.params;
    const user = await User.findOne({ companyCode });
    if (!user) {
      return res.status(404).json({ success: false, message: 'Company not found.' });
    }
    return res.status(200).json({ success: true, company: user });
  } catch (err) {
    console.error('[get company]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

/* ─────────────────────────────────────────────
   PUT /api/auth/company/:companyCode/address
───────────────────────────────────────────── */
router.put('/company/:companyCode/address', async (req, res) => {
  try {
    const { companyCode } = req.params;
    const { companyAddress } = req.body;

    if (companyAddress === undefined) {
      return res.status(400).json({ success: false, message: 'Address is required.' });
    }

    const user = await User.findOneAndUpdate(
      { companyCode },
      { companyAddress: companyAddress.trim() },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ success: false, message: 'Company not found.' });
    }

    return res.status(200).json({ success: true, message: 'Address updated.', companyAddress: user.companyAddress });
  } catch (err) {
    console.error('[update address]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

/* ─────────────────────────────────────────────
   PUT /api/auth/company/:companyCode/password
───────────────────────────────────────────── */
router.put('/company/:companyCode/password', async (req, res) => {
  try {
    const { companyCode } = req.params;
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Old and new passwords are required.' });
    }

    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters and include an uppercase letter, a number, and a symbol.',
      });
    }

    const user = await User.findOne({ companyCode });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Incorrect old password.' });
    }

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    user.password = hashedPassword;
    await user.save();

    return res.status(200).json({ success: true, message: 'Password updated successfully.' });
  } catch (err) {
    console.error('[update password]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

/* ─────────────────────────────────────────────
   POST /api/auth/company/:companyCode/request-rm
───────────────────────────────────────────── */
router.post('/company/:companyCode/request-rm', async (req, res) => {
  try {
    const { companyCode } = req.params;
    const user = await User.findOne({ companyCode });
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    // 8 hour throttle check
    if (user.rmRequestTime) {
      const hoursSinceRequest = (Date.now() - new Date(user.rmRequestTime).getTime()) / (1000 * 60 * 60);
      if (hoursSinceRequest < 8) {
        return res.status(429).json({ success: false, message: `Admin will assign u an Relationship Manager as soon, so check after few minitue. Please wait ${Math.ceil(8 - hoursSinceRequest)} hours to request again.` });
      }
    }

    user.rmRequestTime = new Date();
    await user.save();

    // Async notify admin
    notifyAdminOfRmRequest(user).catch(e => console.error('[rm request mail error]:', e));

    return res.status(200).json({ success: true, message: 'Admin will assign u an Relationship Manager as soon, so check after few minitue', rmRequestTime: user.rmRequestTime });
  } catch (err) {
    console.error('[request rm]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

/* ─────────────────────────────────────────────
   PUT /api/auth/company/:companyCode/tags
───────────────────────────────────────────── */
router.put('/company/:companyCode/tags', async (req, res) => {
  try {
    const { companyCode } = req.params;
    const { tags } = req.body;

    if (!Array.isArray(tags)) {
      return res.status(400).json({ success: false, message: 'Tags must be an array.' });
    }

    const user = await User.findOneAndUpdate(
      { companyCode },
      { tags: tags.map(t => t.trim()).filter(t => t !== '') },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ success: false, message: 'Company not found.' });
    }

    return res.status(200).json({ success: true, message: 'Tags updated.', tags: user.tags });
  } catch (err) {
    console.error('[update tags]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

/* ─────────────────────────────────────────────
   PUT /api/auth/company/:companyCode/team-size
───────────────────────────────────────────── */
router.put('/company/:companyCode/team-size', async (req, res) => {
  try {
    const { companyCode } = req.params;
    const { teamSize } = req.body;

    if (!teamSize) {
      return res.status(400).json({ success: false, message: 'Team size is required.' });
    }

    const user = await User.findOneAndUpdate(
      { companyCode },
      { teamSize: teamSize.toString() },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ success: false, message: 'Company not found.' });
    }

    return res.status(200).json({ success: true, message: 'Team size updated.', teamSize: user.teamSize });
  } catch (err) {
    console.error('[update team-size]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

/* ─────────────────────────────────────────────
   PUT /api/auth/company/:companyCode/assign-rm (ADMIN ONLY MOCK)
───────────────────────────────────────────── */
router.put('/company/:companyCode/assign-rm', async (req, res) => {
  try {
    const { companyCode } = req.params;
    const { name, phone, email, workingDays, workingHours } = req.body;
    
    const user = await User.findOneAndUpdate(
      { companyCode },
      { 
        relationshipManager: { name, phone, email, workingDays, workingHours }
      },
      { new: true }
    );
    if (!user) return res.status(404).json({ success: false, message: 'Company not found.' });
    
    return res.status(200).json({ success: true, message: 'RM assigned!', company: user });
  } catch (err) {
    console.error('[assign rm]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
