const express = require('express');
const Employee = require('../../../models/Employee');
const router = express.Router();

// GET employees for a given company code
router.get('/', async (req, res) => {
  try {
    const { companyCode } = req.query;
    if (!companyCode) {
      return res.status(400).json({ success: false, message: 'companyCode is required' });
    }
    const employees = await Employee.find({ companyCode }).sort({ createdAt: -1 });
    return res.status(200).json({ success: true, employees });
  } catch (err) {
    console.error('[get employees]', err);
    return res.status(500).json({ success: false, message: 'Server error fetching employees' });
  }
});

// POST a new employee
router.post('/', async (req, res) => {
  try {
    const { name, mobile, companyCode, countryCode } = req.body;
    if (!name || !mobile || !companyCode) {
      return res.status(400).json({ success: false, message: 'Name, mobile, and companyCode are required.' });
    }
    const newEmployee = await Employee.create({ name, mobile, companyCode, countryCode: countryCode || '+91' });
    return res.status(201).json({ success: true, employee: newEmployee, message: 'Employee added successfully.' });
  } catch (err) {
    console.error('[post employee]', err);
    return res.status(500).json({ success: false, message: 'Server error saving employee' });
  }
});

// PATCH employee code — set or update (optional, employee sets it themselves)
router.patch('/:id/code', async (req, res) => {
  try {
    const { employeeCode } = req.body;
    if (!employeeCode || !employeeCode.trim()) {
      return res.status(400).json({ success: false, message: 'Employee code is required.' });
    }
    const employee = await Employee.findByIdAndUpdate(
      req.params.id,
      { employeeCode: employeeCode.trim() },
      { returnDocument: 'after' },
    );
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found.' });
    }
    return res.status(200).json({ success: true, employee });
  } catch (err) {
    console.error('[patch employee code]', err);
    return res.status(500).json({ success: false, message: 'Server error updating employee code.' });
  }
});

// PATCH employee tags (update employee and add tag to company)
router.patch('/:id/tags', async (req, res) => {
  try {
    const { tags, companyCode } = req.body;
    if (!tags || !Array.isArray(tags)) {
      return res.status(400).json({ success: false, message: 'Tags array is required.' });
    }

    const employee = await Employee.findByIdAndUpdate(
      req.params.id,
      { $set: { tags: tags } },
      { returnDocument: 'after' }
    );
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    // Add new tags to the company profile uniquely
    if (companyCode) {
      const User = require('../../../models/User');
      await User.findOneAndUpdate(
        { companyCode },
        { $addToSet: { tags: { $each: tags } } }
      );
    }

    return res.status(200).json({ success: true, employee });
  } catch (err) {
    console.error('[patch employee tags]', err);
    return res.status(500).json({ success: false, message: 'Server error updating employee tags.' });
  }
});

// PUT update employee details
router.put('/:id', async (req, res) => {
  try {
    const { name, mobile, countryCode, tags } = req.body;
    const updateData = {};
    if (name) updateData.name = name;
    if (mobile) updateData.mobile = mobile;
    if (countryCode) updateData.countryCode = countryCode;
    if (tags && Array.isArray(tags)) updateData.tags = tags;

    const employee = await Employee.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { returnDocument: 'after' }
    );

    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    return res.status(200).json({ success: true, employee, message: 'Employee updated successfully.' });
  } catch (err) {
    console.error('[update employee]', err);
    return res.status(500).json({ success: false, message: 'Server error updating employee.' });
  }
});

// Employee Login (via mobile + companyCode)
router.post('/login', async (req, res) => {
  try {
    const { companyCode, mobile, countryCode } = req.body;
    if (!companyCode || !mobile) {
      return res.status(400).json({ success: false, message: 'Company code and mobile number are required.' });
    }
    const query = { companyCode, mobile };
    if (countryCode) query.countryCode = countryCode;
    const employee = await Employee.findOne(query);
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found with this number & company code.' });
    }
    return res.status(200).json({ success: true, message: 'Employee authenticated', employee });
  } catch (err) {
    console.error('[employee login]', err);
    return res.status(500).json({ success: false, message: 'Server error during employee login' });
  }
});

module.exports = router;
