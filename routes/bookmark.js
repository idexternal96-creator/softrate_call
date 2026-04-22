const express = require('express');
const Bookmark = require('../models/Bookmark');
const eventBus = require('../services/eventBus');
const router = express.Router();

// POST — create or update a bookmark (Follow-up)
router.post('/', async (req, res) => {
  try {
    const { 
      companyCode, employeePhone, contactNumber, contactName, companyName,
      description, remark, newRemark, brochuresSent, techMeet, meetingRemarks, 
      quotationSent, proposalSent, whatsappGrp, 
      reminderDate 
    } = req.body;

    if (!companyCode || !employeePhone || !contactNumber) {
      return res.status(400).json({ success: false, message: 'companyCode, employeePhone and contactNumber are required.' });
    }

    // Check if a bookmark already exists for this contact and employee
    let bookmark = await Bookmark.findOne({ companyCode, contactNumber });

    const activeRemark = newRemark || remark;

    if (bookmark) {
      // Update existing
      const updateData = {
        description: description || bookmark.description,
        brochuresSent: brochuresSent !== undefined ? !!brochuresSent : bookmark.brochuresSent,
        techMeet: techMeet !== undefined ? !!techMeet : bookmark.techMeet,
        meetingRemarks: meetingRemarks !== undefined ? !!meetingRemarks : bookmark.meetingRemarks,
        quotationSent: quotationSent !== undefined ? !!quotationSent : bookmark.quotationSent,
        proposalSent: proposalSent !== undefined ? !!proposalSent : bookmark.proposalSent,
        whatsappGrp: whatsappGrp !== undefined ? !!whatsappGrp : bookmark.whatsappGrp,
        reminderDate: reminderDate || bookmark.reminderDate,
      };

      if (activeRemark) {
        updateData.remarks = [...(bookmark.remarks || []), activeRemark];
      }

      bookmark = await Bookmark.findByIdAndUpdate(bookmark._id, { $set: updateData }, { returnDocument: 'after' });
      eventBus.emitToEmployee(bookmark.companyCode, bookmark.employeePhone, { type: 'BOOKMARK_UPDATED', bookmark });
    } else {
      // Create new
      const initialRemarks = [];
      if (activeRemark) initialRemarks.push(activeRemark);

      bookmark = await Bookmark.create({
        companyCode, employeePhone, contactNumber,
        contactName: contactName || '',
        companyName: companyName || '',
        description: description || activeRemark || '',
        remarks: initialRemarks,
        brochuresSent: !!brochuresSent,
        techMeet: !!techMeet,
        meetingRemarks: !!meetingRemarks,
        quotationSent: !!quotationSent,
        proposalSent: !!proposalSent,
        whatsappGrp: !!whatsappGrp,
        reminderDate: reminderDate || null,
      });
      eventBus.emitToEmployee(bookmark.companyCode, bookmark.employeePhone, { type: 'BOOKMARK_CREATED', bookmark });
    }

    return res.status(201).json({ success: true, bookmark });
  } catch (err) {
    console.error('[post bookmark]', err);
    return res.status(500).json({ success: false, message: 'Server error saving bookmark.' });
  }
});

// GET — fetch all bookmarks for a company (Admin view)
router.get('/admin', async (req, res) => {
  try {
    const { companyCode } = req.query;
    if (!companyCode) {
      return res.status(400).json({ success: false, message: 'companyCode is required.' });
    }
    const bookmarks = await Bookmark.find({ companyCode }).sort({ reminderDate: 1 });
    return res.status(200).json({ success: true, bookmarks });
  } catch (err) {
    console.error('[get admin bookmarks]', err);
    return res.status(500).json({ success: false, message: 'Server error fetching company bookmarks.' });
  }
});

// GET — fetch all bookmarks for an employee
router.get('/', async (req, res) => {
  try {
    const { companyCode, phone } = req.query;
    if (!companyCode || !phone) {
      return res.status(400).json({ success: false, message: 'companyCode and phone are required.' });
    }
    const bookmarks = await Bookmark.find({ companyCode, employeePhone: phone }).sort({ createdAt: -1 });
    return res.status(200).json({ success: true, bookmarks });
  } catch (err) {
    console.error('[get bookmarks]', err);
    return res.status(500).json({ success: false, message: 'Server error fetching bookmarks.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const bookmark = await Bookmark.findByIdAndDelete(req.params.id);
    if (bookmark) {
      eventBus.emitToEmployee(bookmark.companyCode, bookmark.employeePhone, { type: 'BOOKMARK_DELETED', id: req.params.id });
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[delete bookmark]', err);
    return res.status(500).json({ success: false, message: 'Server error deleting bookmark.' });
  }
});

// PATCH — update a bookmark by ID
router.patch('/:id', async (req, res) => {
  try {
    const { 
      description, remark, newRemark, reminderDate, remarks,
      brochuresSent, techMeet, meetingRemarks, 
      quotationSent, proposalSent, whatsappGrp
    } = req.body;

    const updateData = {};
    if (description !== undefined) updateData.description = description;
    if (reminderDate !== undefined) updateData.reminderDate = reminderDate;
    if (brochuresSent !== undefined) updateData.brochuresSent = brochuresSent;
    if (techMeet !== undefined) updateData.techMeet = techMeet;
    if (meetingRemarks !== undefined) updateData.meetingRemarks = meetingRemarks;
    if (quotationSent !== undefined) updateData.quotationSent = quotationSent;
    if (proposalSent !== undefined) updateData.proposalSent = proposalSent;
    if (whatsappGrp !== undefined) updateData.whatsappGrp = whatsappGrp;

    // Handle Remarks logic
    let finalRemarks = remarks; 
    const activeNewRemark = newRemark || remark;
    
    if (activeNewRemark) {
      if (finalRemarks) {
        finalRemarks.push(activeNewRemark);
      } else {
        const existing = await Bookmark.findById(req.params.id);
        if (existing) {
          finalRemarks = [...(existing.remarks || []), activeNewRemark];
        }
      }
    }

    if (finalRemarks !== undefined) {
      updateData.remarks = finalRemarks;
    }

    const bookmark = await Bookmark.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { returnDocument: 'after' }
    );

    if (!bookmark) return res.status(404).json({ success: false, message: 'Bookmark not found.' });
    eventBus.emitToEmployee(bookmark.companyCode, bookmark.employeePhone, { type: 'BOOKMARK_UPDATED', bookmark });
    return res.status(200).json({ success: true, bookmark });
  } catch (err) {
    console.error('[patch bookmark]', err);
    return res.status(500).json({ success: false, message: 'Server error updating bookmark.' });
  }
});

module.exports = router;
