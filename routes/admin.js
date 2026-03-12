const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { notifyCompanyOfApproval, notifyCompanyOfRejection } = require('../services/mailService');

const router = express.Router();

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@softrate.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Softrate@123';
const JWT_SECRET = process.env.JWT_SECRET || 'your_admin_jwt_secret';

// Admin Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  
  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '1d' });
    return res.json({ success: true, token });
  }
  
  return res.status(401).json({ success: false, message: 'Invalid admin credentials' });
});

// Middleware to protect admin routes
const protectAdmin = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: 'Unauthorised' });
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role === 'admin') {
      next();
    } else {
      res.status(403).json({ success: false, message: 'Forbidden' });
    }
  } catch (err) {
    res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

// Get all companies
router.get('/companies', protectAdmin, async (req, res) => {
  try {
    const companies = await User.find({}).sort({ createdAt: -1 });
    res.json({ success: true, companies });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Approve company trial
router.patch('/approve/:id', protectAdmin, async (req, res) => {
  try {
    const company = await User.findById(req.params.id);
    if (!company) return res.status(404).json({ success: false, message: 'Company not found' });
    
    company.status = 'Free-Trial';
    company.isApproved = true;
    company.trialStartDate = new Date();
    await company.save();
    
    // Notify company
    await notifyCompanyOfApproval(company);
    
    res.json({ success: true, message: 'Company approved for 7-day trial', company });
  } catch (err) {
    console.error('[approve]:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

// Reject company trial
router.patch('/reject/:id', protectAdmin, async (req, res) => {
  try {
    const company = await User.findById(req.params.id);
    if (!company) return res.status(404).json({ success: false, message: 'Company not found' });
    
    // We can either delete or keep as rejected. User asked for approve/reject.
    const { email, name } = company;
    await User.findByIdAndDelete(req.params.id);
    
    // Notify company
    await notifyCompanyOfRejection(email, name);
    
    res.json({ success: true, message: 'Trial request rejected and account removed' });
  } catch (err) {
    console.error('[reject]:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

module.exports = router;
