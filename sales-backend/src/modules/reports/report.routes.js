const express  = require('express');
const router   = express.Router();
const CallLog  = require('../../../models/CallLog');
const CallDetail = require('../../../models/CallDetail');
const Employee = require('../../../models/Employee');
const User     = require('../../../models/User');
const { getOrSet } = require('../../../services/cacheService');
const {
  CALLLOG_CACHE_TTLS,
  buildCalllogCacheKey,
  invalidateCalllogCaches,
} = require('../../../services/calllogCache');
const { buildPageResponse, parsePageQuery } = require('../../common/pagination/pagination');

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Format date as YYYY-MM-DD in IST (matches the mobile sync date field).
function toDateStr(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayIST() {
  return toDateStr(new Date(Date.now() + IST_OFFSET_MS));
}

function addDays(dateStr, days) {
  const [year, month, day] = String(dateStr).split('-').map(Number);
  if (!year || !month || !day) return todayIST();
  return toDateStr(new Date(Date.UTC(year, month - 1, day) + (days * DAY_MS)));
}

function dateRange(label) {
  const today = todayIST();
  if (label === 'today') return [today, today];
  if (label === 'yesterday') {
    const yesterday = addDays(today, -1);
    return [yesterday, yesterday];
  }
  if (label === 'lastweek') {
    return [addDays(today, -6), today];
  }
  return [today, today];
}

// Resolve date range from request: custom from/to takes priority
function resolveRange(query) {
  const { period = 'today', from, to } = query;
  if (from) {
    return [from, to || todayIST()];
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

      // Fetch company setting for connected call threshold
      const connThreshold = company?.connectedCallDuration || 0;

      // 2. Recalculate daily aggregate from individual DETAIL records for total accuracy
      const allCallsToday = await CallDetail.find({ companyCode, phone, date });
      let inc = 0, out = 0, mis = 0, rej = 0, conn = 0;
      let incConn = 0, outConn = 0;
      let incDur = 0, outDur = 0, totDur = 0;

      for (const c of allCallsToday) {
        const type = c.callType.toLowerCase();
        const dur = c.duration || 0;
        const isConnected = connThreshold > 0 ? (dur >= connThreshold) : (dur > 0);
        
        if (isConnected) conn++;

        if (type === 'incoming') { 
          inc++; incDur += dur; totDur += dur;
          if (isConnected) incConn++;
        }
        else if (type === 'outgoing') { 
          out++; outDur += dur; totDur += dur;
          if (isConnected) outConn++;
        }
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
            connected: conn,
            incomingConnected: incConn,
            outgoingConnected: outConn,
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

    await invalidateCalllogCaches({ companyCode, phone });

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
    const cacheKey = buildCalllogCacheKey(`calllog:summary:${companyCode}`, { ...req.query, from, to });
    const { value } = await getOrSet(cacheKey, CALLLOG_CACHE_TTLS.summary, async () => {
      const docs = await CallLog.find({ companyCode, date: { $gte: from, $lte: to } }).lean();
      const totals = docs.reduce((acc, d) => ({
        incoming: acc.incoming + d.incoming, outgoing: acc.outgoing + d.outgoing,
        missed: acc.missed + d.missed, rejected: acc.rejected + d.rejected,
        incomingDuration: acc.incomingDuration + d.incomingDuration,
        outgoingDuration: acc.outgoingDuration + d.outgoingDuration,
        totalDuration: acc.totalDuration + d.totalDuration,
        connected: acc.connected + (d.connected || 0),
        incomingConnected: acc.incomingConnected + (d.incomingConnected || 0),
        outgoingConnected: acc.outgoingConnected + (d.outgoingConnected || 0),
      }), { incoming:0, outgoing:0, missed:0, rejected:0, incomingDuration:0, outgoingDuration:0, totalDuration:0, connected:0, incomingConnected:0, outgoingConnected:0 });

      return {
        success: true, from, to,
        stats: {
          ...totals,
          total: totals.incoming + totals.outgoing + totals.missed + totals.rejected,
          connected: totals.connected,
        },
      };
    });

    return res.status(200).json(value);
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
    const cacheKey = buildCalllogCacheKey(`calllog:employees:${companyCode}`, { ...req.query, from, to });

    const { value } = await getOrSet(cacheKey, CALLLOG_CACHE_TTLS.employees, async () => {
      // If advanced filters are present, we MUST aggregate from individual CallDetail records
      if (callType || duration || callTime) {
        const query = { companyCode, date: { $gte: from, $lte: to } };
        
        if (callType && callType !== 'Select') query.callType = callType.toLowerCase();

        let calls = await CallDetail.find(query).lean();

        if (duration && duration !== 'Select') {
          calls = calls.filter(c => {
            if (duration === '< 1 min') return c.duration < 60;
            if (duration === '1-5 min') return c.duration >= 60 && c.duration <= 300;
            if (duration === '> 5 min') return c.duration > 300;
            return true;
          });
        }

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

        const company = await User.findOne({ companyCode }, 'connectedCallDuration').lean();
        const connThreshold = company?.connectedCallDuration || 0;

        const map = {};
        for (const c of calls) {
          if (!map[c.phone]) map[c.phone] = { phone: c.phone, incoming:0, outgoing:0, missed:0, rejected:0, incomingDuration:0, outgoingDuration:0, totalDuration:0, connected:0, incomingConnected:0, outgoingConnected:0 };
          const e = map[c.phone];
          const type = c.callType.toLowerCase();
          const dur = c.duration || 0;
          const isConnected = connThreshold > 0 ? (dur >= connThreshold) : (dur > 0);
          
          if (isConnected) e.connected++;
          
          if (type === 'incoming') { 
            e.incoming++; e.incomingDuration += dur; e.totalDuration += dur;
            if (isConnected) e.incomingConnected++;
          }
          else if (type === 'outgoing') { 
            e.outgoing++; e.outgoingDuration += dur; e.totalDuration += dur;
            if (isConnected) e.outgoingConnected++;
          }
          else if (type === 'missed') { e.missed++; }
          else if (type === 'rejected') { e.rejected++; }
        }

        const employees = Object.values(map).map(e => ({ ...e, total: e.incoming + e.outgoing + e.missed + e.rejected }));
        return { success: true, employees };
      }

      const docs = await CallLog.find({ companyCode, date: { $gte: from, $lte: to } }).lean();
      const map = {};
      for (const d of docs) {
        if (!map[d.phone]) map[d.phone] = { phone: d.phone, incoming:0, outgoing:0, missed:0, rejected:0, incomingDuration:0, outgoingDuration:0, totalDuration:0, connected:0, incomingConnected:0, outgoingConnected:0 };
        const e = map[d.phone];
        e.incoming += d.incoming;
        e.outgoing += d.outgoing;
        e.missed += d.missed;
        e.rejected += d.rejected;
        e.incomingDuration += d.incomingDuration;
        e.outgoingDuration += d.outgoingDuration;
        e.totalDuration += d.totalDuration;
        e.connected += (d.connected || 0);
        e.incomingConnected += (d.incomingConnected || 0);
        e.outgoingConnected += (d.outgoingConnected || 0);
      }
      const employees = Object.values(map).map(e => ({ ...e, total: e.incoming + e.outgoing + e.missed + e.rejected }));
      return { success: true, employees };
    });

    return res.status(200).json(value);
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
    const cacheKey = buildCalllogCacheKey(`calllog:employee:${companyCode}:${phone}`, { ...req.query, from, to });
    const { value } = await getOrSet(cacheKey, CALLLOG_CACHE_TTLS.employee, async () => {
      const docs = await CallLog.find({ companyCode, phone, date: { $gte: from, $lte: to } }).lean();
      const totals = docs.reduce((acc, d) => ({
        incoming: acc.incoming + d.incoming, outgoing: acc.outgoing + d.outgoing,
        missed: acc.missed + d.missed, rejected: acc.rejected + d.rejected,
        incomingDuration: acc.incomingDuration + d.incomingDuration,
        outgoingDuration: acc.outgoingDuration + d.outgoingDuration,
        totalDuration: acc.totalDuration + d.totalDuration,
        connected: acc.connected + (d.connected || 0),
        incomingConnected: acc.incomingConnected + (d.incomingConnected || 0),
        outgoingConnected: acc.outgoingConnected + (d.outgoingConnected || 0),
      }), { incoming:0, outgoing:0, missed:0, rejected:0, incomingDuration:0, outgoingDuration:0, totalDuration:0, connected:0, incomingConnected:0, outgoingConnected:0 });

      return {
        success: true,
        phone,
        from,
        to,
        stats: { ...totals, total: totals.incoming + totals.outgoing + totals.missed + totals.rejected, connected: totals.connected },
      };
    });

    return res.status(200).json(value);
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
    const pagination = parsePageQuery(req.query);
    const cacheKey = buildCalllogCacheKey(`calllog:details:${companyCode}:${phone}`, { ...req.query, from, to });
    const { value } = await getOrSet(cacheKey, CALLLOG_CACHE_TTLS.details, async () => {
      const query = {
        companyCode, phone, date: { $gte: from, $lte: to },
      };
      const search = String(req.query.search || '').trim();
      if (search) {
        const pattern = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        query.$or = [
          { name: pattern },
          { number: pattern },
          { callType: pattern },
        ];
      }

      if (!pagination.isPaginated) {
        const calls = await CallDetail.find(query).sort({ timestamp: -1 }).lean();
        return { success: true, calls, items: calls };
      }

      const [total, calls] = await Promise.all([
        CallDetail.countDocuments(query),
        CallDetail.find(query)
          .sort({ timestamp: -1 })
          .skip(pagination.skip)
          .limit(pagination.pageSize)
          .lean(),
      ]);

      const page = buildPageResponse({
        items: calls,
        total,
        page: pagination.page,
        pageSize: pagination.pageSize,
      });

      return {
        success: true,
        calls: page.items,
        ...page,
      };
    });

    return res.status(200).json(value);
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── GET /api/calllogs/timeline ────────────────────────────────
// Returns array of { date, incoming, outgoing, missed, rejected } per day (or per hour for single day)
router.get('/timeline', async (req, res) => {
  try {
    const { companyCode, phone } = req.query;
    if (!companyCode) return res.status(400).json({ success: false, message: 'companyCode required' });
    const [from, to] = resolveRange(req.query);
    const cachePrefix = phone
      ? `calllog:timeline:${companyCode}:${phone}`
      : `calllog:timeline:${companyCode}`;
    const cacheKey = buildCalllogCacheKey(cachePrefix, { ...req.query, from, to });
    const { value } = await getOrSet(cacheKey, CALLLOG_CACHE_TTLS.timeline, async () => {
      const baseQuery = { companyCode, date: { $gte: from, $lte: to } };
      if (phone) baseQuery.phone = phone;

      if (from === to) {
        const detailQuery = { companyCode, date: from };
        if (phone) detailQuery.phone = phone;
        const calls = await CallDetail.find(detailQuery).lean();
        const byHour = {};

        for (let i = 0; i < 24; i++) {
          const hourStr = i.toString().padStart(2, '0');
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

        return { success: true, timeline: Object.values(byHour) };
      }

      const docs = await CallLog.find(baseQuery).sort({ date: 1 }).lean();
      const byDate = {};
      for (const d of docs) {
        if (!byDate[d.date]) byDate[d.date] = { date: d.date, incoming: 0, outgoing: 0, missed: 0, rejected: 0 };
        byDate[d.date].incoming  += d.incoming;
        byDate[d.date].outgoing  += d.outgoing;
        byDate[d.date].missed    += d.missed;
        byDate[d.date].rejected  += d.rejected;
      }
      return { success: true, timeline: Object.values(byDate).sort((a,b) => a.date.localeCompare(b.date)) };
    });

    return res.status(200).json(value);
  } catch (err) {
    console.error('[calllog timeline]', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── GET /api/calllogs/lead-counts ─────────────────────────────
// Returns total call count per lead number across the entire company
router.get('/lead-counts', async (req, res) => {
  try {
    const { companyCode } = req.query;
    if (!companyCode) return res.status(400).json({ success: false, message: 'companyCode required' });
    const cacheKey = buildCalllogCacheKey(`calllog:lead-counts:${companyCode}`, req.query);
    const { value } = await getOrSet(cacheKey, CALLLOG_CACHE_TTLS.leadCounts, async () => {
      const counts = await CallDetail.aggregate([
        { $match: { companyCode } },
        { $group: { _id: '$number', count: { $sum: 1 } } },
      ]);

      const countMap = {};
      counts.forEach((item) => {
        if (item._id) countMap[item._id] = item.count;
      });

      return { success: true, counts: countMap };
    });

    return res.status(200).json(value);
  } catch (err) {
    console.error('[lead-counts]', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
