const express = require('express');
const BreakLog = require('../../../models/BreakLog');
const User = require('../../../models/User');
const router = express.Router();

// Helper — today's date string in IST (YYYY-MM-DD)
function todayIST() {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

/* ─────────────────────────────────────────────
   POST /api/breaklog/mark
   Employee hits "Break" button — adds a break entry for today.
   Body: { companyCode, employeePhone, employeeName, durationSeconds }
───────────────────────────────────────────── */
router.post('/mark', async (req, res) => {
  try {
    const { companyCode, employeePhone, employeeName, durationSeconds } = req.body;
    if (!companyCode || !employeePhone || durationSeconds === undefined) {
      return res.status(400).json({ success: false, message: 'companyCode, employeePhone, durationSeconds required.' });
    }

    const dur = Number(durationSeconds);
    if (isNaN(dur) || dur < 0) {
      return res.status(400).json({ success: false, message: 'durationSeconds must be a non-negative number.' });
    }

    const date = todayIST();

    // Upsert: find today's record or create it; push new break entry and update total
    const log = await BreakLog.findOneAndUpdate(
      { companyCode, employeePhone, date },
      {
        $push: { breaks: { startedAt: new Date(), durationSeconds: dur } },
        $inc:  { totalSeconds: dur },
        $setOnInsert: { employeeName: employeeName || employeePhone },
      },
      { upsert: true, returnDocument: 'after' }
    );

    if (log && employeeName) {
      log.employeeName = employeeName;
      await log.save();
    }

    const company = await User.findOne({ companyCode }, 'breakHourLimit');
    const limitMin = company?.breakHourLimit ?? 60;
    const limitSec = limitMin * 60;

    return res.json({
      success: true,
      totalSeconds: log.totalSeconds,
      overLimit: log.totalSeconds > limitSec,
      limitSeconds: limitSec,
    });
  } catch (err) {
    console.error('[breaklog mark]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

/* ─────────────────────────────────────────────
   GET /api/breaklog/today?companyCode=XXX
   Admin: get today's break summary for all employees.
───────────────────────────────────────────── */
router.get('/today', async (req, res) => {
  try {
    const { companyCode } = req.query;
    if (!companyCode) return res.status(400).json({ success: false, message: 'companyCode required.' });

    const date = todayIST();
    const logs = await BreakLog.find({ companyCode, date }).sort({ totalSeconds: -1 });

    const company = await User.findOne({ companyCode }, 'breakHourLimit');
    const limitMin = company?.breakHourLimit ?? 60;
    const limitSec = limitMin * 60;

    const overLimit = logs.filter(l => l.totalSeconds > limitSec).map(l => ({
      employeePhone: l.employeePhone,
      employeeName: l.employeeName,
      totalSeconds: l.totalSeconds,
      limitSeconds: limitSec,
    }));

    return res.json({ success: true, logs, overLimit, limitSeconds: limitSec });
  } catch (err) {
    console.error('[breaklog today]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

/* ─────────────────────────────────────────────
   GET /api/breaklog/employee-today?companyCode=XXX&employeePhone=YYY
   Employee: get own today's break total.
───────────────────────────────────────────── */
router.get('/employee-today', async (req, res) => {
  try {
    const { companyCode, employeePhone } = req.query;
    if (!companyCode || !employeePhone) {
      return res.status(400).json({ success: false, message: 'companyCode and employeePhone required.' });
    }
    const date = todayIST();
    const log = await BreakLog.findOne({ companyCode, employeePhone, date });
    const company = await User.findOne({ companyCode }, 'breakHourLimit');
    const limitMin = company?.breakHourLimit ?? 60;
    const limitSec = limitMin * 60;

    return res.json({
      success: true,
      totalSeconds: log?.totalSeconds ?? 0,
      limitSeconds: limitSec,
      overLimit: (log?.totalSeconds ?? 0) > limitSec,
    });
  } catch (err) {
    console.error('[breaklog employee-today]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
