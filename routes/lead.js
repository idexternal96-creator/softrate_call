const express = require('express');
const Lead = require('../models/Lead');
const eventBus = require('../services/eventBus');
const router = express.Router();

// POST — create a single lead
router.post('/', async (req, res) => {
  try {
    const { companyCode, assignedEmployeePhone, leadCompanyName, contactName, contactNumber, status, setLabel, companyDescription, mainDivisionDescription, directorEmailAddress, remarks } = req.body;
    if (!companyCode || !assignedEmployeePhone || !contactNumber || !leadCompanyName) {
      return res.status(400).json({ success: false, message: 'companyCode, assignedEmployeePhone, leadCompanyName, and contactNumber are required.' });
    }
    const lead = await Lead.create({
      companyCode, assignedEmployeePhone, leadCompanyName,
      contactName: contactName || '',
      contactNumber,
      status: status || 'New',
      setLabel: setLabel || '',
      companyDescription: companyDescription || '',
      mainDivisionDescription: mainDivisionDescription || '',
      directorEmailAddress: directorEmailAddress || '',
      remarks: remarks ? (Array.isArray(remarks) ? remarks : [remarks]) : [],
    });
    eventBus.emitToEmployee(lead.companyCode, lead.assignedEmployeePhone, { type: 'LEAD_CREATED', lead });
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
    if (createdLeads.length > 0) {
      // Broadcast to company so all employees sync the new leads
      eventBus.emitToCompany(createdLeads[0].companyCode, { type: 'LEADS_REFRESH' });
    }
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

// GET — fetch only distinct set labels for an employee
router.get('/employee/sets', async (req, res) => {
  try {
    const { companyCode, phone } = req.query;
    if (!companyCode || !phone) {
      return res.status(400).json({ success: false, message: 'companyCode and phone are required.' });
    }
    const sets = await Lead.distinct('setLabel', { companyCode, assignedEmployeePhone: phone });
    return res.status(200).json({ success: true, sets: sets.filter(s => s && s.trim()) });
  } catch (err) {
    console.error('[get employee sets]', err);
    return res.status(500).json({ success: false, message: 'Server error fetching sets.' });
  }
});

// GET — fetch all leads for an admin's company (optionally filter by setLabel)
router.get('/admin', async (req, res) => {
  try {
    const { companyCode, setLabel, remark } = req.query;
    if (!companyCode) {
      return res.status(400).json({ success: false, message: 'companyCode is required.' });
    }
    const query = { companyCode };
    if (setLabel) {
      query.setLabel = setLabel;
    }
    if (remark) {
      query.remarks = { $regex: remark, $options: 'i' };
    }
    const leads = await Lead.find(query).sort({ sheetOrder: 1, createdAt: 1 });

    // Also return distinct set labels for this company
    const sets = await Lead.distinct('setLabel', { companyCode });

    return res.status(200).json({ success: true, leads, sets: sets.filter(s => s && s.trim()) });
  } catch (err) {
    console.error('[get admin leads]', err);
    return res.status(500).json({ success: false, message: 'Server error fetching leads.' });
  }
});

// POST — remove all leads in a set for an employee
router.post('/set/delete', async (req, res) => {
  try {
    const { companyCode, phone, setLabel } = req.body;
    if (!companyCode || !phone || !setLabel) {
      return res.status(400).json({ success: false, message: 'companyCode, phone, and setLabel are required.' });
    }
    const result = await Lead.deleteMany({ companyCode, assignedEmployeePhone: phone, setLabel });
    eventBus.emitToEmployee(companyCode, phone, { type: 'LEADS_REFRESH' });
    return res.status(200).json({ success: true, deleted: result.deletedCount });
  } catch (err) {
    console.error('[delete set leads]', err);
    return res.status(500).json({ success: false, message: 'Server error deleting set.' });
  }
});

// POST — remove all leads in a set for the whole company
router.post('/admin/delete-set', async (req, res) => {
  try {
    const { companyCode, setLabel } = req.body;
    if (!companyCode || !setLabel) {
      return res.status(400).json({ success: false, message: 'companyCode and setLabel are required.' });
    }
    const result = await Lead.deleteMany({ companyCode, setLabel });
    // Refresh all employees in the company
    eventBus.emitToCompany(companyCode, { type: 'LEADS_REFRESH' });
    return res.status(200).json({ success: true, deleted: result.deletedCount });
  } catch (err) {
    console.error('[admin delete set leads]', err);
    return res.status(500).json({ success: false, message: 'Server error deleting admin set.' });
  }
});

// DELETE — remove a single lead by ID
router.delete('/:id', async (req, res) => {
  try {
    const lead = await Lead.findByIdAndDelete(req.params.id);
    if (lead) {
      eventBus.emitToEmployee(lead.companyCode, lead.assignedEmployeePhone, { type: 'LEAD_DELETED', id: req.params.id });
    }
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
    eventBus.emitToEmployee(lead.companyCode, lead.assignedEmployeePhone, { type: 'LEAD_UPDATED', lead });
    return res.status(200).json({ success: true, lead });
  } catch (err) {
    console.error('[update lead status]', err);
    return res.status(500).json({ success: false, message: 'Server error updating lead status.' });
  }
});

// PATCH — update lead flags (isStarred, isFavourite)
router.patch('/:id/flags', async (req, res) => {
  try {
    const update = {};
    if (req.body.isStarred !== undefined) update.isStarred = req.body.isStarred;
    if (req.body.isFavourite !== undefined) update.isFavourite = req.body.isFavourite;
    
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ success: false, message: 'No flags provided to update.' });
    }

    const lead = await Lead.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true }
    );
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found.' });
    eventBus.emitToEmployee(lead.companyCode, lead.assignedEmployeePhone, { type: 'LEAD_UPDATED', lead });
    return res.status(200).json({ success: true, lead });
  } catch (err) {
    console.error('[update lead flags]', err);
    return res.status(500).json({ success: false, message: 'Server error updating lead flags.' });
  }
});

// POST — add a remark to a lead
router.post('/:id/remarks', async (req, res) => {
  try {
    const { remark } = req.body;
    if (!remark) return res.status(400).json({ success: false, message: 'Remark is required.' });
    
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found.' });

    // Handle legacy string data vs new array data
    let currentRemarks = lead.remarks;
    if (!Array.isArray(currentRemarks)) {
      currentRemarks = (currentRemarks && typeof currentRemarks === 'string') ? [currentRemarks] : [];
    }
    
    // Create new array with the new remark
    const updatedRemarks = [...currentRemarks, remark];

    // Use $set to overwrite the field completely, which avoids "must be an array" errors
    const updatedLead = await Lead.findByIdAndUpdate(
      req.params.id,
      { $set: { remarks: updatedRemarks } },
      { new: true }
    );
    
    eventBus.emitToEmployee(updatedLead.companyCode, updatedLead.assignedEmployeePhone, { type: 'LEAD_UPDATED', lead: updatedLead });
    return res.status(200).json({ success: true, lead: updatedLead });
  } catch (err) {
    console.error('[add lead remark]', err);
    return res.status(500).json({ success: false, message: 'Server error adding remark.' });
  }
});

// DELETE — remove a specific remark from a lead
router.delete('/:id/remarks/:index', async (req, res) => {
  try {
    const { id, index } = req.params;
    const lead = await Lead.findById(id);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found.' });

    if (!Array.isArray(lead.remarks)) {
      return res.status(400).json({ success: false, message: 'Remarks is not an array.' });
    }

    const updatedRemarks = [...lead.remarks];
    updatedRemarks.splice(parseInt(index), 1);

    const updatedLead = await Lead.findByIdAndUpdate(
      id,
      { $set: { remarks: updatedRemarks } },
      { new: true }
    );
    
    eventBus.emitToEmployee(updatedLead.companyCode, updatedLead.assignedEmployeePhone, { type: 'LEAD_UPDATED', lead: updatedLead });
    return res.status(200).json({ success: true, lead: updatedLead });
  } catch (err) {
    console.error('[delete lead remark]', err);
    return res.status(500).json({ success: false, message: 'Server error deleting remark.' });
  }
});

module.exports = router;
