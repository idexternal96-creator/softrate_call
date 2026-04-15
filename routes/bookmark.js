const express = require('express');
const Bookmark = require('../models/Bookmark');
const router = express.Router();

// POST — create a bookmark
router.post('/', async (req, res) => {
  try {
    const { companyCode, employeePhone, contactNumber, contactName, description, callTimestamp, reminderDate } = req.body;
    if (!companyCode || !employeePhone || !contactNumber) {
      return res.status(400).json({ success: false, message: 'companyCode, employeePhone and contactNumber are required.' });
    }
    const bookmark = await Bookmark.create({
      companyCode, employeePhone, contactNumber,
      contactName: contactName || '',
      description: description || '',
      callTimestamp: callTimestamp || 0,
      reminderDate: reminderDate || null,
    });
    return res.status(201).json({ success: true, bookmark });
  } catch (err) {
    console.error('[post bookmark]', err);
    return res.status(500).json({ success: false, message: 'Server error saving bookmark.' });
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
    const { description, reminderDate } = req.body;
    const bookmark = await Bookmark.findByIdAndUpdate(
      req.params.id,
      { description, reminderDate },
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
