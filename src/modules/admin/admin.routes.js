const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../../../models/User');
const Admin = require('../../../models/Admin');
const Payment = require('../../../models/Payment');
const { notifyCompanyOfApproval, notifyCompanyOfRejection } = require('../../../services/mailService');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is required. Add it to the workspace root .env file.');
}

// Admin Login (JSON API)
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  
  try {
    const admin = await Admin.findOne({ email });
    if (admin && admin.password === password) {
      const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '1d' });
      return res.json({ success: true, token });
    }
    return res.status(401).json({ success: false, message: 'Invalid admin credentials' });
  } catch (err) {
    console.error('[admin login]:', err);
    return res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

// Admin Login (HTML Form POST)
router.post('/login-form', async (req, res) => {
  const { email, password } = req.body;
  
  // We need the frontend URL to redirect back to. In production this would be standard, 
  // but for local testing assuming standard file:// or localhost server for frontend.
  // Instead of redirecting to a file:// which browsers block, we'll try to redirect
  // to an absolute URL if possible. Since we don't know the exact host of the admin-page, 
  // we could return an HTML page that sets the localStorage and then redirects.
  try {
    const admin = await Admin.findOne({ email });
    if (admin && admin.password === password) {
      const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '1d' });
      
      // Return a snippet of HTML that sets localStorage and redirects to dashboard.html
      // We do this because the admin-page is just static files and may not be served by
      // this express backend on the same port.
      return res.send(`
        <html>
          <body>
            <script>
              localStorage.setItem('adminToken', '${token}');
              window.location.href = document.referrer.replace('index.html', '') + 'dashboard.html';
            </script>
          </body>
        </html>
      `);
    }
    
    // Redirect back to login with error
    return res.send(`
      <html>
        <body>
          <script>
            window.location.href = document.referrer.split('?')[0] + '?error=Invalid%20admin%20credentials';
          </script>
        </body>
      </html>
    `);
  } catch (err) {
    console.error('[admin form login]:', err);
    return res.status(500).send(`Server error: ${err.message}`);
  }
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

// Assign RM
router.post('/assign-rm/:companyCode', protectAdmin, async (req, res) => {
  try {
    const { companyCode } = req.params;
    const rmData = req.body;
    
    // Validate inputs
    if (!rmData.name || !rmData.phone || !rmData.email) {
      return res.status(400).json({ success: false, message: 'Missing required RM details' });
    }

    const company = await User.findOneAndUpdate(
      { companyCode },
      { relationshipManager: rmData },
      { returnDocument: 'after' }
    );
    if (!company) return res.status(404).json({ success: false, message: 'Company not found' });
    
    res.json({ success: true, message: 'RM Assigned', company });
  } catch (err) {
    console.error('[assign rm]:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

// Get company payment history
router.get('/payments/:companyCode', protectAdmin, async (req, res) => {
  try {
    const { companyCode } = req.params;
    // Case-insensitive regex match for companyCode to avoid mismatches
    const payments = await Payment.find({ 
      companyCode: new RegExp('^' + companyCode + '$', 'i')
    }).sort({ createdAt: -1 });
    
    res.json({ success: true, payments });
  } catch (err) {
    console.error('[admin payments]:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

module.exports = router;
