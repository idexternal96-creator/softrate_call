const express = require('express');
const Lead = require('../models/Lead');
const router = express.Router();

// POST — create a single lead
router.post('/', async (req, res) => {
  try {
    const { companyCode, assignedEmployeePhone, leadCompanyName, contactName, contactNumber, status } = req.body;
    if (!companyCode || !assignedEmployeePhone || !contactNumber || !leadCompanyName) {
      return res.status(400).json({ success: false, message: 'companyCode, assignedEmployeePhone, leadCompanyName, and contactNumber are required.' });
    }
    const lead = await Lead.create({
      companyCode, assignedEmployeePhone, leadCompanyName,
      contactName: contactName || '',
      contactNumber,
      status: status || 'New',
    });
    return res.status(201).json({ success: true, lead });
  } catch (err) {
    console.error('[post lead]', err);
    return res.status(500).json({ success: false, message: 'Server error saving lead.' });
  }
});

// POST — create bulk leads via mapped JSON data (Excel upload)
router.post('/bulk', async (req, res) => {
  try {
    const { leads } = req.body; // Array of mapped lead objects
    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({ success: false, message: 'No leads provided for bulk insert.' });
    }
    const createdLeads = await Lead.insertMany(leads);
    return res.status(201).json({ success: true, count: createdLeads.length });
  } catch (err) {
    console.error('[bulk post leads]', err);
    return res.status(500).json({ success: false, message: 'Server error bulk saving leads.' });
  }
}
);

// GET — fetch all leads for an employee
router.get('/employee', async (req, res) => {
  try {
    const { companyCode, phone } = req.query;
    if (!companyCode || !phone) {
      return res.status(400).json({ success: false, message: 'companyCode and phone are required.' });
    }
    const leads = await Lead.find({ companyCode, assignedEmployeePhone: phone }).sort({ createdAt: -1 });
    return res.status(200).json({ success: true, leads });
  } catch (err) {
    console.error('[get employee leads]', err);
    return res.status(500).json({ success: false, message: 'Server error fetching leads.' });
  }
});

// GET — fetch all leads for an admin's company
router.get('/admin', async (req, res) => {
  try {
    const { companyCode } = req.query;
    if (!companyCode) {
      return res.status(400).json({ success: false, message: 'companyCode is required.' });
    }
    const leads = await Lead.find({ companyCode }).sort({ createdAt: -1 });
    return res.status(200).json({ success: true, leads });
  } catch (err) {
    console.error('[get admin leads]', err);
    return res.status(500).json({ success: false, message: 'Server error fetching leads.' });
  }
});

// DELETE — remove a lead by ID
router.delete('/:id', async (req, res) => {
  try {
    await Lead.findByIdAndDelete(req.params.id);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[delete lead]', err);
    return res.status(500).json({ success: false, message: 'Server error deleting lead.' });
  }
});

module.exports = router;
