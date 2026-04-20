const express = require('express');
const Bookmark = require('../models/Bookmark');
const router = express.Router();

// POST — create a bookmark
router.post('/', async (req, res) => {
  try {
    const { 
      companyCode, employeePhone, contactNumber, contactName, companyName,
      description, remark, brochuresSent, techMeet, meetingRemarks, 
      quotationSent, proposalSent, whatsappGrp, 
      callTimestamp, reminderDate 
    } = req.body;

    if (!companyCode || !employeePhone || !contactNumber) {
      return res.status(400).json({ success: false, message: 'companyCode, employeePhone and contactNumber are required.' });
    }

    const initialRemarks = [];
    if (description) initialRemarks.push(description);
    if (remark) initialRemarks.push(remark);

    const bookmark = await Bookmark.create({
      companyCode, employeePhone, contactNumber,
      contactName: contactName || '',
      companyName: companyName || '',
      description: description || remark || '',
      remarks: initialRemarks,
      brochuresSent: !!brochuresSent,
      techMeet: !!techMeet,
      meetingRemarks: !!meetingRemarks,
      quotationSent: !!quotationSent,
      proposalSent: !!proposalSent,
      whatsappGrp: !!whatsappGrp,
      callTimestamp: callTimestamp || 0,
      reminderDate: reminderDate || null,
    });
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

// DELETE — remove a bookmark by ID
router.delete('/:id', async (req, res) => {
  try {
    await Bookmark.findByIdAndDelete(req.params.id);
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

    // Handle Remarks logic to avoid ConflictingUpdateOperators
    let finalRemarks = remarks; // if remarks array was sent (e.g. from editing history)
    
    if (newRemark) {
      if (finalRemarks) {
        finalRemarks.push(newRemark);
      } else {
        // If remarks array wasn't sent, we need the current one to push to it 
        // OR we can use $push if we aren't $setting. 
        // But to be safe and consistent, let's handle it here.
        const existing = await Bookmark.findById(req.params.id);
        if (existing) {
          finalRemarks = [...(existing.remarks || []), newRemark];
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
    return res.status(200).json({ success: true, bookmark });
  } catch (err) {
    console.error('[patch bookmark]', err);
    return res.status(500).json({ success: false, message: 'Server error updating bookmark.' });
  }
});

module.exports = router;
