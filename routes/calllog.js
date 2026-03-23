const express  = require('express');
const router   = express.Router();
const CallLog  = require('../models/CallLog');
const CallDetail = require('../models/CallDetail');
const Employee = require('../models/Employee');
const User     = require('../models/User');

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

    // ── Subscription guard ──────────────────────────────────────
    const company = await User.findOne({ companyCode });
    if (company) {
      const now = new Date();
      const isExpired = company.status === 'On due' ||
        (company.subscriptionTo && new Date(company.subscriptionTo) < now);
      if (isExpired) {
        return res.status(403).json({
          success: false,
          message: 'Subscription expired. Please renew your plan to continue syncing call records.',
          code: 'SUBSCRIPTION_EXPIRED',
        });
      }
    }
    // ────────────────────────────────────────────────────────────

    // 1. Upsert individual call entries (Append/Update instead of Replace)
    if (calls && Array.isArray(calls) && calls.length > 0) {
      const ops = calls.map(c => ({
        updateOne: {
          filter: { 
            companyCode, 
            phone, 
            timestamp: new Date(c.timestamp), 
            number: c.number 
          },
          update: { 
            $set: {
              companyCode, phone, date,
              number:    c.number    || '',
              name:      c.name      || '',
              callType:  c.callType.toLowerCase(),
              duration:  c.duration  || 0,
              timestamp: new Date(c.timestamp),
            }
          },
          upsert: true
        }
      }));
      
      await CallDetail.bulkWrite(ops);

      // 2. Recalculate daily aggregate from individual DETAIL records for total accuracy
      const allCallsToday = await CallDetail.find({ companyCode, phone, date });
      let inc = 0, out = 0, mis = 0, rej = 0;
      let incDur = 0, outDur = 0, totDur = 0;

      for (const c of allCallsToday) {
        const type = c.callType.toLowerCase();
        const dur = c.duration || 0;
        totDur += dur;

        if (type === 'incoming') { inc++; incDur += dur; }
        else if (type === 'outgoing') { out++; outDur += dur; }
        else if (type === 'missed') { mis++; }
        else if (type === 'rejected') { rej++; }
      }

      // 3. Update the daily aggregate log
      await CallLog.findOneAndUpdate(
        { companyCode, phone, date },
        { $set: { 
            incoming: inc, outgoing: out, missed: mis, rejected: rej,
            incomingDuration: incDur, outgoingDuration: outDur,
            totalDuration: totDur, 
            updatedAt: new Date() 
          } 
        },
        { upsert: true }
      );

      // 4. Update lastCallTime on employee record
      const lastCallObj = allCallsToday.reduce((latest, c) =>
        c.timestamp > latest ? c : latest, allCallsToday[0]);

      await Employee.findOneAndUpdate(
        { companyCode, mobile: phone },
        { $set: {
            deviceModel:  deviceModel  || '',
            appVersion:   appVersion   || '',
            lastCallTime: lastCallObj ? lastCallObj.timestamp : new Date(),
            lastSyncTime: new Date(),
          }
        }
      );
    } else {
      // No new calls, but still update the daily record existence and sync time
      await CallLog.findOneAndUpdate(
        { companyCode, phone, date },
        { $setOnInsert: { incoming:0, outgoing:0, missed:0, rejected:0, totalDuration:0 },
          $set: { updatedAt: new Date() } },
        { upsert: true }
      );
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
    const { companyCode, callType, duration, callTime } = req.query;
    if (!companyCode) return res.status(400).json({ success: false, message: 'companyCode required' });
    const [from, to] = resolveRange(req.query);

    // If advanced filters are present, we MUST aggregate from individual CallDetail records
    if (callType || duration || callTime) {
      const query = { companyCode, date: { $gte: from, $lte: to } };
      
      // 1. Filter by callType if specified
      if (callType && callType !== 'Select') query.callType = callType.toLowerCase();

      let calls = await CallDetail.find(query);

      // 2. Filter by duration on the items found
      if (duration && duration !== 'Select') {
        calls = calls.filter(c => {
          if (duration === '< 1 min') return c.duration < 60;
          if (duration === '1-5 min') return c.duration >= 60 && c.duration <= 300;
          if (duration === '> 5 min') return c.duration > 300;
          return true;
        });
      }

      // 3. Filter by callTime (Time of Day)
      if (callTime && callTime !== 'Select') {
        calls = calls.filter(c => {
          const hour = new Date(c.timestamp).getHours();
          if (callTime === 'Morning') return hour >= 6 && hour < 12;
          if (callTime === 'Afternoon') return hour >= 12 && hour < 17;
          if (callTime === 'Evening') return hour >= 17 && hour < 21;
          if (callTime === 'Night') return (hour >= 21 && hour <= 23) || (hour >= 0 && hour < 6);
          return true;
        });
      }

      // Aggregate filtered calls by employee
      const map = {};
      for (const c of calls) {
        if (!map[c.phone]) map[c.phone] = { phone: c.phone, incoming:0, outgoing:0, missed:0, rejected:0, incomingDuration:0, outgoingDuration:0, totalDuration:0 };
        const e = map[c.phone];
        const type = c.callType.toLowerCase();
        if (type === 'incoming') { e.incoming++; e.incomingDuration += c.duration; }
        else if (type === 'outgoing') { e.outgoing++; e.outgoingDuration += c.duration; }
        else if (type === 'missed') { e.missed++; }
        else if (type === 'rejected') { e.rejected++; }
        e.totalDuration += c.duration;
      }
      const employees = Object.values(map).map(e => ({ ...e, total: e.incoming+e.outgoing+e.missed+e.rejected }));
      return res.status(200).json({ success: true, employees });
    }

    // Default: Use pre-aggregated CallLog for speed
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
    console.error('[employees report]', err);
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
// Returns array of { date, incoming, outgoing, missed, rejected } per day (or per hour for single day)
router.get('/timeline', async (req, res) => {
  try {
    const { companyCode } = req.query;
    if (!companyCode) return res.status(400).json({ success: false, message: 'companyCode required' });
    const [from, to] = resolveRange(req.query);

    if (from === to) {
      // Single day: group by hour from CallDetail
      const calls = await CallDetail.find({ companyCode, date: from });
      const byHour = {};
      
      // Initialize all 24 hours to ensure a continuous line
      for (let i = 0; i < 24; i++) {
        const hourStr = i.toString().padStart(2, '0');
        // We use a pseudo-date string so the frontend can still use new Date()
        const pseudoDate = `${from}T${hourStr}:00:00`;
        byHour[i] = { date: pseudoDate, incoming: 0, outgoing: 0, missed: 0, rejected: 0, _isHourly: true };
      }

      for (const c of calls) {
        const hour = new Date(c.timestamp).getHours();
        const type = c.callType.toLowerCase();
        if (byHour[hour]) {
          if (type === 'incoming') byHour[hour].incoming++;
          else if (type === 'outgoing') byHour[hour].outgoing++;
          else if (type === 'missed') byHour[hour].missed++;
          else if (type === 'rejected') byHour[hour].rejected++;
        }
      }
      return res.status(200).json({ success: true, timeline: Object.values(byHour) });
    } else {
      // Multiple days: group by date from CallLog
      const docs = await CallLog.find({ companyCode, date: { $gte: from, $lte: to } }).sort({ date: 1 });
      const byDate = {};
      for (const d of docs) {
        if (!byDate[d.date]) byDate[d.date] = { date: d.date, incoming: 0, outgoing: 0, missed: 0, rejected: 0 };
        byDate[d.date].incoming  += d.incoming;
        byDate[d.date].outgoing  += d.outgoing;
        byDate[d.date].missed    += d.missed;
        byDate[d.date].rejected  += d.rejected;
      }
      return res.status(200).json({ success: true, timeline: Object.values(byDate).sort((a,b) => a.date.localeCompare(b.date)) });
    }
  } catch (err) {
    console.error('[calllog timeline]', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
