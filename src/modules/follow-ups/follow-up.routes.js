const express = require('express');
const Bookmark = require('../../../models/Bookmark');
const eventBus = require('../../../services/eventBus');
const { logChange } = require('../../../services/historyService');
const router = express.Router();

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildAdminBookmarkQuery(query) {
  const { companyCode, search, filter, reminderDate } = query;
  const mongoQuery = { companyCode };

  const activeDate = reminderDate || (filter === 'today' ? new Date().toISOString().slice(0, 10) : '');
  if (activeDate) {
    const start = new Date(`${activeDate}T00:00:00.000Z`);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    mongoQuery.reminderDate = { $gte: start, $lt: end };
  }

  if (search && String(search).trim()) {
    const pattern = new RegExp(escapeRegex(search.trim()), 'i');
    mongoQuery.$or = [
      { contactName: pattern },
      { contactNumber: pattern },
      { companyName: pattern },
      { description: pattern },
      { remarks: pattern },
    ];
  }

  return mongoQuery;
}

function groupBookmarksByCompany(bookmarks) {
  const counts = new Map();
  bookmarks.forEach((bookmark) => {
    const company = bookmark.companyName || 'Unnamed Company';
    counts.set(company, (counts.get(company) || 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([company, count]) => ({ company, name: company, count }))
    .sort((a, b) => a.company.localeCompare(b.company));
}

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

      // Log History
      await logChange({
        companyCode: bookmark.companyCode,
        contactNumber: bookmark.contactNumber,
        companyName: bookmark.companyName,
        action: 'Follow-up Updated',
        details: activeRemark ? `New Remark: ${activeRemark}` : 'Follow-up details changed',
        changedBy: bookmark.employeePhone
      });
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

      // Log History
      await logChange({
        companyCode: bookmark.companyCode,
        contactNumber: bookmark.contactNumber,
        contactName: bookmark.contactName,
        companyName: bookmark.companyName,
        action: 'Bookmarked',
        details: activeRemark ? `Initial Remark: ${activeRemark}` : 'Added to follow-ups',
        changedBy: bookmark.employeePhone
      });
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
    const query = buildAdminBookmarkQuery(req.query);
    const bookmarks = await Bookmark.find(query).sort({ reminderDate: 1, createdAt: -1 }).lean();
    const companies = groupBookmarksByCompany(bookmarks);

    return res.status(200).json({
      success: true,
      bookmarks,
      companies,
      page: 1,
      pageSize: companies.length,
      total: companies.length,
      totalBookmarks: bookmarks.length,
      hasMore: false,
    });
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

    // Log History
    await logChange({
      companyCode: bookmark.companyCode,
      contactNumber: bookmark.contactNumber,
      contactName: bookmark.contactName,
      companyName: bookmark.companyName,
      action: 'Follow-up Updated',
      details: activeNewRemark ? `New Remark: ${activeNewRemark}` : 'Follow-up details patched',
      changedBy: bookmark.employeePhone
    });

    return res.status(200).json({ success: true, bookmark });
  } catch (err) {
    console.error('[patch bookmark]', err);
    return res.status(500).json({ success: false, message: 'Server error updating bookmark.' });
  }
});

// POST — bulk create or update bookmarks
router.post('/bulk', async (req, res) => {
  try {
    const { bookmarks } = req.body;
    if (!bookmarks || !Array.isArray(bookmarks)) {
      return res.status(400).json({ success: false, message: 'Bookmarks array is required.' });
    }

    const results = [];
    for (const b of bookmarks) {
      const { companyCode, contactNumber, employeePhone } = b;
      if (!companyCode || !contactNumber || !employeePhone) continue;

      if (b.reminderDate) {
        const parsedDate = new Date(b.reminderDate);
        if (isNaN(parsedDate.getTime())) {
          b.remarks = b.remarks || [];
          b.remarks.push(`Reminder note: ${b.reminderDate}`);
          b.reminderDate = null;
        }
      }

      let existing = await Bookmark.findOne({ companyCode, contactNumber });
      if (existing) {
        // Merge remarks and update other fields
        const newRemarks = [...(existing.remarks || []), ...(b.remarks || [])];
        const updateData = {
          ...b,
          remarks: Array.from(new Set(newRemarks)) // dedupe if needed
        };
        const updated = await Bookmark.findByIdAndUpdate(existing._id, { $set: updateData }, { returnDocument: 'after' });
        results.push(updated);
        eventBus.emitToEmployee(updated.companyCode, updated.employeePhone, { type: 'BOOKMARK_UPDATED', bookmark: updated });
      } else {
        const created = await Bookmark.create(b);
        results.push(created);
        eventBus.emitToEmployee(created.companyCode, created.employeePhone, { type: 'BOOKMARK_CREATED', bookmark: created });

        // Log History
        logChange({
          companyCode: created.companyCode,
          contactNumber: created.contactNumber,
          contactName: created.contactName,
          companyName: created.companyName,
          action: 'Bookmarked (Bulk)',
          changedBy: created.employeePhone
        }).catch(err => console.error('[history bookmark bulk error]:', err));
      }
    }

    return res.status(201).json({ success: true, count: results.length });
  } catch (err) {
    console.error('[bulk bookmarks]', err);
    return res.status(500).json({ success: false, message: 'Server error during bulk bookmark import.' });
  }
});

module.exports = router;
