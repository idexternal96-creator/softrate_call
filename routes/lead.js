const express = require('express');
const Lead = require('../models/Lead');
const router = express.Router();

// POST — create a single lead
router.post('/', async (req, res) => {
  try {
    const { companyCode, assignedEmployeePhone, leadCompanyName, contactName, contactNumber, status, setLabel } = req.body;
    if (!companyCode || !assignedEmployeePhone || !contactNumber || !leadCompanyName) {
      return res.status(400).json({ success: false, message: 'companyCode, assignedEmployeePhone, leadCompanyName, and contactNumber are required.' });
    }
    const lead = await Lead.create({
      companyCode, assignedEmployeePhone, leadCompanyName,
      contactName: contactName || '',
      contactNumber,
      status: status || 'New',
      setLabel: setLabel || '',
    });
    return res.status(201).json({ success: true, lead });
  } catch (err) {
    console.error('[post lead]', err);
    return res.status(500).json({ success: false, message: 'Server error saving lead.' });
  }
});

// POST — create bulk leads via mapped JSON data (Excel upload)
// Each object in `leads` must include a `sheetOrder` field (0-based row index
// from the sheet) so that the original row sequence is preserved on fetch.
router.post('/bulk', async (req, res) => {
  try {
    const { leads } = req.body; // Array of mapped lead objects
    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({ success: false, message: 'No leads provided for bulk insert.' });
    }
    // Stamp sheetOrder if caller didn't send it (safety net)
    const stamped = leads.map((l, i) => ({ sheetOrder: i, ...l }));
    const createdLeads = await Lead.insertMany(stamped);
    return res.status(201).json({ success: true, count: createdLeads.length });
  } catch (err) {
    console.error('[bulk post leads]', err);
    return res.status(500).json({ success: false, message: 'Server error bulk saving leads.' });
  }
});

// GET — fetch all leads for an employee (optionally filter by setLabel)
router.get('/employee', async (req, res) => {
  try {
    const { companyCode, phone, setLabel } = req.query;
    if (!companyCode || !phone) {
      return res.status(400).json({ success: false, message: 'companyCode and phone are required.' });
    }
    const query = { companyCode, assignedEmployeePhone: phone };
    if (setLabel) query.setLabel = setLabel;
    const leads = await Lead.find(query).sort({ sheetOrder: 1, createdAt: 1 }); // preserve sheet row order

    // Also return distinct set labels for this employee
    const sets = await Lead.distinct('setLabel', { companyCode, assignedEmployeePhone: phone });

    return res.status(200).json({ success: true, leads, sets: sets.filter(s => s && s.trim()) });
  } catch (err) {
    console.error('[get employee leads]', err);
    return res.status(500).json({ success: false, message: 'Server error fetching leads.' });
  }
});

// GET — fetch all leads for an admin's company (optionally filter by setLabel)
router.get('/admin', async (req, res) => {
  try {
    const { companyCode, setLabel } = req.query;
    if (!companyCode) {
      return res.status(400).json({ success: false, message: 'companyCode is required.' });
    }
    const query = { companyCode };
    let leads = [];
    if (setLabel) {
      query.setLabel = setLabel;
      leads = await Lead.find(query).sort({ sheetOrder: 1, createdAt: 1 });
    }

    // Also return distinct set labels for this company
    const sets = await Lead.distinct('setLabel', { companyCode });

    return res.status(200).json({ success: true, leads, sets: sets.filter(s => s && s.trim()) });
  } catch (err) {
    console.error('[get admin leads]', err);
    return res.status(500).json({ success: false, message: 'Server error fetching leads.' });
  }
});

// POST — remove all leads in a set for an employee (must come BEFORE /:id to avoid route conflict)
router.post('/set/delete', async (req, res) => {
  try {
    const { companyCode, phone, setLabel } = req.body;
    if (!companyCode || !phone || !setLabel) {
      return res.status(400).json({ success: false, message: 'companyCode, phone, and setLabel are required.' });
    }
    const result = await Lead.deleteMany({ companyCode, assignedEmployeePhone: phone, setLabel });
    return res.status(200).json({ success: true, deleted: result.deletedCount });
  } catch (err) {
    console.error('[delete set leads]', err);
    return res.status(500).json({ success: false, message: 'Server error deleting set.' });
  }
});

// DELETE — remove a single lead by ID
router.delete('/:id', async (req, res) => {
  try {
    await Lead.findByIdAndDelete(req.params.id);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[delete lead]', err);
    return res.status(500).json({ success: false, message: 'Server error deleting lead.' });
  }
});

// PATCH — update lead status
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ success: false, message: 'Status is required.' });
    }
    const lead = await Lead.findByIdAndUpdate(req.params.id, { status }, { returnDocument: 'after' });
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found.' });
    return res.status(200).json({ success: true, lead });
  } catch (err) {
    console.error('[update lead status]', err);
    return res.status(500).json({ success: false, message: 'Server error updating lead status.' });
  }
});

module.exports = router;
