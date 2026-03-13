const express  = require('express');
const router   = express.Router();
const CallLog  = require('../models/CallLog');
const CallDetail = require('../models/CallDetail');
const Employee = require('../models/Employee');

// Format date as YYYY-MM-DD using LOCAL time (matches what Flutter sends)
function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dateRange(label) {
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // local midnight
  if (label === 'today') return [toDateStr(today), toDateStr(today)];
  if (label === 'yesterday') {
    const y = new Date(today); y.setDate(y.getDate() - 1);
    return [toDateStr(y), toDateStr(y)];
  }
  if (label === 'lastweek') {
    // Return a rolling 7-day window (today - 6 days to today)
    const start = new Date(today); 
    start.setDate(today.getDate() - 6);
    return [toDateStr(start), toDateStr(today)];
  }
  return [toDateStr(today), toDateStr(today)];
}

// Resolve date range from request: custom from/to takes priority
function resolveRange(query) {
  const { period = 'today', from, to } = query;
  if (from) {
    const now = new Date();
    return [from, to || toDateStr(new Date(now.getFullYear(), now.getMonth(), now.getDate()))];
  }
  return dateRange(period);
}

function sumDocs(docs) {
  return docs.reduce((acc, d) => ({
    incoming: acc.incoming + d.incoming, outgoing: acc.outgoing + d.outgoing,
    missed: acc.missed + d.missed, rejected: acc.rejected + d.rejected,
    incomingDuration: acc.incomingDuration + d.incomingDuration,
    outgoingDuration: acc.outgoingDuration + d.outgoingDuration,
    totalDuration: acc.totalDuration + d.totalDuration,
  }), { incoming:0, outgoing:0, missed:0, rejected:0, incomingDuration:0, outgoingDuration:0, totalDuration:0 });
}


// ── POST /api/calllogs/sync ───────────────────────────────────
// Receives daily aggregate + individual call entries + device info
router.post('/sync', async (req, res) => {
  try {
    const {
      companyCode, phone, date,
      incoming, outgoing, missed, rejected,
      incomingDuration, outgoingDuration, totalDuration,
      // individual call entries array
      calls,
      // device info
      deviceModel, appVersion,
    } = req.body;

    if (!companyCode || !phone || !date) {
      return res.status(400).json({ success: false, message: 'companyCode, phone, date required.' });
    }

    // 1. Upsert daily aggregate
    await CallLog.findOneAndUpdate(
      { companyCode, phone, date },
      { $set: { incoming: incoming||0, outgoing: outgoing||0, missed: missed||0, rejected: rejected||0,
                incomingDuration: incomingDuration||0, outgoingDuration: outgoingDuration||0,
                totalDuration: totalDuration||0, updatedAt: new Date() } },
      { upsert: true }
    );

    // 2. Upsert individual call entries (replace today's detail for this employee)
    if (calls && Array.isArray(calls) && calls.length > 0) {
      // Remove existing details for this employee today, then insert fresh
      await CallDetail.deleteMany({ companyCode, phone, date });
      const docs = calls.map(c => ({
        companyCode, phone, date,
        number:    c.number    || '',
        name:      c.name      || '',
        callType:  c.callType  || 'unknown',
        duration:  c.duration  || 0,
        timestamp: new Date(c.timestamp),
      }));
      await CallDetail.insertMany(docs);

      // Update lastCallTime on employee record
      const lastCall = calls.reduce((latest, c) =>
        c.timestamp > latest ? c.timestamp : latest, calls[0]?.timestamp || 0);

      await Employee.findOneAndUpdate(
        { companyCode, mobile: phone },
        { $set: {
            deviceModel:  deviceModel  || '',
            appVersion:   appVersion   || '',
            lastCallTime: new Date(lastCall),
            lastSyncTime: new Date(),
          }
        }
      );
    } else {
      // Still update sync time even with no calls
      await Employee.findOneAndUpdate(
        { companyCode, mobile: phone },
        { $set: { deviceModel: deviceModel||'', appVersion: appVersion||'', lastSyncTime: new Date() } }
      );
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[calllog sync]', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── GET /api/calllogs/summary ─────────────────────────────────
router.get('/summary', async (req, res) => {
  try {
    const { companyCode } = req.query;
    if (!companyCode) return res.status(400).json({ success: false, message: 'companyCode required' });
    const [from, to] = resolveRange(req.query);
    const docs = await CallLog.find({ companyCode, date: { $gte: from, $lte: to } });
    const totals = sumDocs(docs);
    return res.status(200).json({
      success: true, from, to,
      stats: { ...totals, total: totals.incoming+totals.outgoing+totals.missed+totals.rejected,
               connected: totals.incoming+totals.outgoing },
    });
  } catch (err) {
    console.error('[calllog summary]', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── GET /api/calllogs/employees ───────────────────────────────
router.get('/employees', async (req, res) => {
  try {
    const { companyCode } = req.query;
    if (!companyCode) return res.status(400).json({ success: false, message: 'companyCode required' });
    const [from, to] = resolveRange(req.query);
    const docs = await CallLog.find({ companyCode, date: { $gte: from, $lte: to } });
    const map = {};
    for (const d of docs) {
      if (!map[d.phone]) map[d.phone] = { phone: d.phone, incoming:0, outgoing:0, missed:0, rejected:0, incomingDuration:0, outgoingDuration:0, totalDuration:0 };
      const e = map[d.phone];
      e.incoming+=d.incoming; e.outgoing+=d.outgoing; e.missed+=d.missed; e.rejected+=d.rejected;
      e.incomingDuration+=d.incomingDuration; e.outgoingDuration+=d.outgoingDuration; e.totalDuration+=d.totalDuration;
    }
    const employees = Object.values(map).map(e => ({ ...e, total: e.incoming+e.outgoing+e.missed+e.rejected }));
    return res.status(200).json({ success: true, employees });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── GET /api/calllogs/employee ────────────────────────────────
router.get('/employee', async (req, res) => {
  try {
    const { companyCode, phone } = req.query;
    if (!companyCode || !phone) return res.status(400).json({ success: false, message: 'companyCode and phone required' });
    const [from, to] = resolveRange(req.query);
    const docs = await CallLog.find({ companyCode, phone, date: { $gte: from, $lte: to } });
    const totals = sumDocs(docs);
    return res.status(200).json({
      success: true, phone, from, to,
      stats: { ...totals, total: totals.incoming+totals.outgoing+totals.missed+totals.rejected, connected: totals.incoming+totals.outgoing },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── GET /api/calllogs/details ─────────────────────────────────
// Individual call entries for one employee on a given date/period
router.get('/details', async (req, res) => {
  try {
    const { companyCode, phone } = req.query;
    if (!companyCode || !phone) return res.status(400).json({ success: false, message: 'companyCode and phone required' });
    const [from, to] = resolveRange(req.query);

    const calls = await CallDetail.find({
      companyCode, phone, date: { $gte: from, $lte: to },
    }).sort({ timestamp: -1 });

    return res.status(200).json({ success: true, calls });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── GET /api/calllogs/timeline ────────────────────────────────
// Returns array of { date, incoming, outgoing, missed, rejected } per day in range
router.get('/timeline', async (req, res) => {
  try {
    const { companyCode } = req.query;
    if (!companyCode) return res.status(400).json({ success: false, message: 'companyCode required' });
    const [from, to] = resolveRange(req.query);
    const docs = await CallLog.find({ companyCode, date: { $gte: from, $lte: to } }).sort({ date: 1 });

    // Group by date
    const byDate = {};
    for (const d of docs) {
      if (!byDate[d.date]) byDate[d.date] = { date: d.date, incoming: 0, outgoing: 0, missed: 0, rejected: 0 };
      byDate[d.date].incoming  += d.incoming;
      byDate[d.date].outgoing  += d.outgoing;
      byDate[d.date].missed    += d.missed;
      byDate[d.date].rejected  += d.rejected;
    }
    return res.status(200).json({ success: true, timeline: Object.values(byDate) });
  } catch (err) {
    console.error('[calllog timeline]', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
