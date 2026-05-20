const express = require('express');
const Bookmark = require('../../../models/Bookmark');
const eventBus = require('../../../services/eventBus');
const { logChange } = require('../../../services/historyService');
const { buildPageResponse, parsePageQuery } = require('../../common/pagination/pagination');
const router = express.Router();

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function dateBoundary(dateValue, endOfDay = false) {
  const raw = String(dateValue || '').trim();
  if (!raw) return null;
  const dateOnly = raw.slice(0, 10);
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

function applyReminderDateRange(query, fromValue, toValue = fromValue) {
  const from = dateBoundary(fromValue);
  const to = dateBoundary(toValue, true);
  if (!from && !to) return;
  query.reminderDate = {};
  if (from) query.reminderDate.$gte = from;
  if (to) query.reminderDate.$lt = to;
}

function buildEmployeeBookmarkQuery(reqQuery) {
  const query = {
    companyCode: String(reqQuery.companyCode || '').trim(),
    employeePhone: String(reqQuery.phone || reqQuery.employeePhone || '').trim(),
  };

  const companyName = String(reqQuery.companyName || '').trim();
  if (companyName) {
    query.companyName = new RegExp(`^${escapeRegex(companyName)}$`, 'i');
  }

  const search = String(reqQuery.search || '').trim();
  if (search) {
    const pattern = new RegExp(escapeRegex(search), 'i');
    query.$or = [
      { contactName: pattern },
      { contactNumber: pattern },
      { companyName: pattern },
      { description: pattern },
      { remarks: pattern },
    ];
  }

  if (reqQuery.filter === 'today') {
    applyReminderDateRange(query, new Date().toISOString().slice(0, 10));
  } else if (reqQuery.reminderDate) {
    applyReminderDateRange(query, reqQuery.reminderDate);
  } else if (reqQuery.dateFrom || reqQuery.dateTo) {
    applyReminderDateRange(query, reqQuery.dateFrom || reqQuery.dateTo, reqQuery.dateTo || reqQuery.dateFrom);
  }

  return query;
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
    const { companyCode, paginated, search, filter, reminderDate } = req.query;
    if (!companyCode) {
      return res.status(400).json({ success: false, message: 'companyCode is required.' });
    }

    const query = { companyCode };
    if (filter === 'today') {
      const today = new Date().toISOString().slice(0, 10);
      query.reminderDate = { $regex: `^${today}` };
    }
    if (reminderDate) {
      query.reminderDate = { $regex: `^${String(reminderDate).slice(0, 10)}` };
    }
    if (search) {
      const pattern = new RegExp(String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$or = [
        { contactName: pattern },
        { contactNumber: pattern },
        { companyName: pattern },
        { description: pattern },
        { remarks: pattern },
      ];
    }

    if (paginated === 'true' || paginated === true) {
      const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
      const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 40, 1), 100);

      const companies = await Bookmark.aggregate([
        { $match: query },
        { $group: { _id: { $ifNull: ['$companyName', 'Unnamed Company'] }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
        {
          $facet: {
            data: [{ $skip: (page - 1) * pageSize }, { $limit: pageSize }],
            total: [{ $count: 'count' }],
          },
        },
      ]);

      const groups = companies?.[0]?.data || [];
      const total = companies?.[0]?.total?.[0]?.count || 0;
      const namedCompanyNames = groups
        .map((group) => String(group._id || '').trim())
        .filter((name) => name && name !== 'Unnamed Company');
      const includesUnnamed = groups.some((group) => {
        const name = String(group._id || '').trim();
        return !name || name === 'Unnamed Company';
      });
      const companyFilters = [];

      if (namedCompanyNames.length) {
        companyFilters.push({ companyName: { $in: namedCompanyNames } });
      }
      if (includesUnnamed) {
        companyFilters.push(
          { companyName: { $exists: false } },
          { companyName: null },
          { companyName: '' },
          { companyName: { $regex: '^\\s*$' } },
        );
      }

      const bookmarkQuery = { ...query };
      if (companyFilters.length) {
        bookmarkQuery.$and = [...(bookmarkQuery.$and || []), { $or: companyFilters }];
      }

      const bookmarks = companyFilters.length
        ? await Bookmark.find(bookmarkQuery).sort({ companyName: 1, reminderDate: 1 }).lean()
        : [];

      return res.status(200).json({
        success: true,
        bookmarks,
        companies: groups.map((group) => ({ company: group._id || 'Unnamed Company', name: group._id || 'Unnamed Company', count: group.count })),
        page,
        pageSize,
        total,
        hasMore: page * pageSize < total,
      });
    }

    const bookmarks = await Bookmark.find(query).sort({ reminderDate: 1 });
    return res.status(200).json({ success: true, bookmarks });
  } catch (err) {
    console.error('[get admin bookmarks]', err);
    return res.status(500).json({ success: false, message: 'Server error fetching company bookmarks.' });
  }
});

// GET — fetch all bookmarks for an employee
router.get('/', async (req, res) => {
  try {
    const { companyCode } = req.query;
    const phone = req.query.phone || req.query.employeePhone;
    if (!companyCode || !phone) {
      return res.status(400).json({ success: false, message: 'companyCode and phone are required.' });
    }

    const query = buildEmployeeBookmarkQuery(req.query);
    const pagination = parsePageQuery(req.query);

    if (!pagination.isPaginated) {
      const bookmarks = await Bookmark.find(query).sort({ createdAt: -1 }).lean();
      return res.status(200).json({ success: true, bookmarks, items: bookmarks });
    }

    const [total, bookmarks] = await Promise.all([
      Bookmark.countDocuments(query),
      Bookmark.find(query)
        .sort({ createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.pageSize)
        .lean(),
    ]);

    const page = buildPageResponse({
      items: bookmarks,
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
    });

    return res.status(200).json({
      success: true,
      bookmarks: page.items,
      ...page,
    });
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
