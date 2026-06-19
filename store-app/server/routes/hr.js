const express = require('express');
const logger = require('../utils/logger');
const { getPagination, buildPaginationMeta } = require('../utils/paginate');
const { z } = require('zod');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');
const permissionCheck = require('../middleware/permissionCheck');
const { validateBody } = require('../middleware/validate');

const router = express.Router();

// ============================================
// Haversine distance helper (meters)
// ============================================
function haversineDistanceM(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Check if current time is within an allowed time window.
 * Returns null if OK, or an error message string if outside.
 */
function checkTimeWindow(location, action) {
  const startCol = action === 'clock_in' ? 'clock_in_start' : 'clock_out_start';
  const endCol = action === 'clock_in' ? 'clock_in_end' : 'clock_out_end';
  const startTime = location[startCol];
  const endTime = location[endCol];
  if (!startTime || !endTime) return null; // No window configured

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const startMinutes = sh * 60 + sm;
  const endMinutes = eh * 60 + em;
  const label = action === 'clock_in' ? 'clock in' : 'clock out';
  const fmt = (h, m) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

  if (currentMinutes < startMinutes || currentMinutes > endMinutes) {
    return `You can only ${label} between ${fmt(sh, sm)} and ${fmt(eh, em)}. Current time: ${fmt(now.getHours(), now.getMinutes())}.`;
  }
  return null;
}

// ============================================
// Schemas
// ============================================

const clockInSchema = z.object({
  note: z.string().max(500).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

const clockOutSchema = z.object({
  note: z.string().max(500).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

const createShiftSchema = z.object({
  user_id: z.string().uuid(),
  location_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().regex(/^\d{2}:\d{2}$/),
  role_label: z.string().max(100).optional(),
});

const commissionRuleSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(['flat', 'percentage']),
  value: z.number().min(0),
  min_sale_amount: z.number().min(0).optional().default(0),
  product_category: z.string().max(200).nullable().optional(),
  active: z.boolean().optional().default(true),
});

const payoutSchema = z.object({
  user_id: z.string().uuid(),
  commission_ids: z.array(z.string().uuid()).min(1),
});

// ============================================
// ATTENDANCE ROUTES
// ============================================

/**
 * POST /api/hr/clock-in
 * Record clock-in for authenticated user
 */
router.post('/clock-in', authGuard, validateBody(clockInSchema), async (req, res) => {
  try {
    const { note, latitude, longitude } = req.body;
    const location_id = req.user.active_location_id;

    if (!location_id) {
      return res.status(400).json({ error: 'No active location set. Please select a branch.' });
    }

    // Fetch location for geofence + time window check
    const { data: location } = await supabaseAdmin
      .from('locations')
      .select('id, name, latitude, longitude, geofence_radius_m, clock_in_start, clock_in_end, clock_out_start, clock_out_end')
      .eq('id', location_id)
      .single();

    // Time window validation
    if (location) {
      const timeErr = checkTimeWindow(location, 'clock_in');
      if (timeErr) {
        return res.status(403).json({ error: 'Outside allowed hours', message: timeErr });
      }
    }

    // Geofence validation
    let distanceM = null;
    if (location && location.latitude && location.longitude) {
      if (!latitude || !longitude) {
        return res.status(400).json({
          error: 'Location required',
          message: 'This location requires GPS verification to clock in. Please enable location services.',
        });
      }
      distanceM = Math.round(haversineDistanceM(latitude, longitude, location.latitude, location.longitude));
      const radiusM = location.geofence_radius_m || 200;
      if (distanceM > radiusM) {
        return res.status(403).json({
          error: 'Outside geofence',
          message: `You are ${distanceM}m from ${location.name}. You must be within ${radiusM}m to clock in.`,
          distance: distanceM,
          radius: radiusM,
        });
      }
    }

    // Check if there's already an open clock-in
    const { data: openLog } = await supabaseAdmin
      .from('attendance_logs')
      .select('id, clock_in')
      .eq('user_id', req.user.id)
      .eq('business_id', req.user.business_id)
      .is('clock_out', null)
      .order('clock_in', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (openLog) {
      return res.status(400).json({
        error: 'Already clocked in',
        message: `You are already clocked in since ${new Date(openLog.clock_in).toLocaleTimeString()}. Please clock out first.`,
        activeLog: openLog,
      });
    }

    const insertData = {
      user_id: req.user.id,
      business_id: req.user.business_id,
      location_id,
      note: note || null,
    };
    if (latitude) insertData.clock_in_lat = latitude;
    if (longitude) insertData.clock_in_lng = longitude;
    if (distanceM !== null) insertData.clock_in_distance_m = distanceM;

    const { data, error } = await supabaseAdmin
      .from('attendance_logs')
      .insert(insertData)
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ message: 'Clocked in successfully', log: data, distance: distanceM });
  } catch (err) {
    logger.error({ err }, 'Clock-in error');
    res.status(500).json({ error: 'Failed to clock in' });
  }
});

/**
 * POST /api/hr/clock-out
 * Record clock-out for authenticated user
 */
router.post('/clock-out', authGuard, validateBody(clockOutSchema), async (req, res) => {
  try {
    const { note, latitude, longitude } = req.body;

    // Find open clock-in
    const { data: openLog, error: findError } = await supabaseAdmin
      .from('attendance_logs')
      .select('id, clock_in, location_id')
      .eq('user_id', req.user.id)
      .eq('business_id', req.user.business_id)
      .is('clock_out', null)
      .order('clock_in', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (findError) throw findError;
    if (!openLog) {
      return res.status(400).json({ error: 'Not clocked in', message: 'No active clock-in found.' });
    }

    // Geofence check for clock-out
    let distanceM = null;
    if (openLog.location_id) {
      const { data: location } = await supabaseAdmin
        .from('locations')
        .select('id, name, latitude, longitude, geofence_radius_m, clock_in_start, clock_in_end, clock_out_start, clock_out_end')
        .eq('id', openLog.location_id)
        .single();

      // Time window validation
      if (location) {
        const timeErr = checkTimeWindow(location, 'clock_out');
        if (timeErr) {
          return res.status(403).json({ error: 'Outside allowed hours', message: timeErr });
        }
      }

      if (location && location.latitude && location.longitude) {
        if (!latitude || !longitude) {
          return res.status(400).json({
            error: 'Location required',
            message: 'This location requires GPS verification to clock out. Please enable location services.',
          });
        }
        distanceM = Math.round(haversineDistanceM(latitude, longitude, location.latitude, location.longitude));
        const radiusM = location.geofence_radius_m || 200;
        if (distanceM > radiusM) {
          return res.status(403).json({
            error: 'Outside geofence',
            message: `You are ${distanceM}m from ${location.name}. You must be within ${radiusM}m to clock out.`,
            distance: distanceM,
            radius: radiusM,
          });
        }
      }
    }

    const clockOut = new Date().toISOString();
    const updateData = { clock_out: clockOut };
    if (note) updateData.note = note;
    if (latitude) updateData.clock_out_lat = latitude;
    if (longitude) updateData.clock_out_lng = longitude;
    if (distanceM !== null) updateData.clock_out_distance_m = distanceM;

    const { data, error } = await supabaseAdmin
      .from('attendance_logs')
      .update(updateData)
      .eq('id', openLog.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ message: 'Clocked out successfully', log: data, distance: distanceM });
  } catch (err) {
    logger.error({ err }, 'Clock-out error');
    res.status(500).json({ error: 'Failed to clock out' });
  }
});

/**
 * GET /api/hr/attendance/status
 * Check if user is currently clocked in
 */
router.get('/attendance/status', authGuard, async (req, res) => {
  try {
    const { data: openLog } = await supabaseAdmin
      .from('attendance_logs')
      .select('id, clock_in, location_id, note')
      .eq('user_id', req.user.id)
      .eq('business_id', req.user.business_id)
      .is('clock_out', null)
      .order('clock_in', { ascending: false })
      .limit(1)
      .maybeSingle();

    res.json({ clocked_in: !!openLog, active_log: openLog || null });
  } catch (err) {
    logger.error({ err }, 'Attendance status error');
    res.status(500).json({ error: 'Failed to check attendance status' });
  }
});

/**
 * GET /api/hr/attendance/me
 * Self-service: current user's own attendance log
 */
router.get('/attendance/me', authGuard, async (req, res) => {
  try {
    const { page, limit, offset } = getPagination(req.query);
    const { startDate, endDate } = req.query;

    let query = supabaseAdmin
      .from('attendance_logs')
      .select('*, location:locations!location_id(id, name)', { count: 'exact' })
      .eq('user_id', req.user.id)
      .eq('business_id', req.user.business_id)
      .order('clock_in', { ascending: false })
      .range(offset, offset + limit - 1);

    if (startDate) query = query.gte('clock_in', startDate);
    if (endDate) query = query.lte('clock_in', endDate);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({ data, ...buildPaginationMeta(count, page, limit) });
  } catch (err) {
    logger.error({ err }, 'My attendance error');
    res.status(500).json({ error: 'Failed to fetch attendance' });
  }
});

/**
 * GET /api/hr/attendance
 * Paginated attendance log (manager/admin only)
 */
router.get('/attendance', authGuard, permissionCheck('manage_users'), async (req, res) => {
  try {
    const { page, limit, offset } = getPagination(req.query);
    const { startDate, endDate, userId, locationId } = req.query;

    let query = supabaseAdmin
      .from('attendance_logs')
      .select(`
        *,
        user:users!user_id(id, name, email),
        location:locations!location_id(id, name)
      `, { count: 'exact' })
      .order('clock_in', { ascending: false })
      .range(offset, offset + limit - 1);

    if (req.user.role !== 'Platform Admin') {
      query = query.eq('business_id', req.user.business_id);
    }

    if (userId) query = query.eq('user_id', userId);
    if (locationId) query = query.eq('location_id', locationId);
    if (startDate) query = query.gte('clock_in', startDate);
    if (endDate) query = query.lte('clock_in', endDate);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({ data, ...buildPaginationMeta(count, page, limit) });
  } catch (err) {
    logger.error({ err }, 'Attendance list error');
    res.status(500).json({ error: 'Failed to fetch attendance logs' });
  }
});

// ============================================
// SCHEDULE ROUTES
// ============================================

/**
 * GET /api/hr/schedules
 * Fetch shift schedules for a date range
 */
router.get('/schedules', authGuard, async (req, res) => {
  try {
    const { startDate, endDate, locationId } = req.query;

    let query = supabaseAdmin
      .from('shift_schedules')
      .select(`
        *,
        user:users!user_id(id, name, email),
        location:locations!location_id(id, name)
      `)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true });

    if (req.user.role !== 'Platform Admin') {
      query = query.eq('business_id', req.user.business_id);
    }

    if (locationId) query = query.eq('location_id', locationId);
    if (startDate) query = query.gte('date', startDate);
    if (endDate) query = query.lte('date', endDate);

    const { data, error } = await query;
    if (error) throw error;

    res.json(data);
  } catch (err) {
    logger.error({ err }, 'Schedules fetch error');
    res.status(500).json({ error: 'Failed to fetch schedules' });
  }
});

/**
 * POST /api/hr/schedules
 * Create a shift schedule (manager/admin)
 */
router.post('/schedules', authGuard, permissionCheck('manage_users'), validateBody(createShiftSchema), async (req, res) => {
  try {
    const { user_id, location_id, date, start_time, end_time, role_label } = req.body;

    const { data, error } = await supabaseAdmin
      .from('shift_schedules')
      .insert({
        user_id,
        business_id: req.user.business_id,
        location_id,
        date,
        start_time,
        end_time,
        role_label: role_label || null,
        created_by: req.user.id,
      })
      .select(`*, user:users!user_id(id, name, email), location:locations!location_id(id, name)`)
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Conflict', message: 'This user already has a shift at that date and time.' });
      }
      throw error;
    }

    res.status(201).json(data);
  } catch (err) {
    logger.error({ err }, 'Create shift error');
    res.status(500).json({ error: 'Failed to create shift' });
  }
});

/**
 * PATCH /api/hr/schedules/:id
 * Update a shift schedule
 */
router.patch('/schedules/:id', authGuard, permissionCheck('manage_users'), async (req, res) => {
  try {
    const { id } = req.params;
    const allowedFields = ['start_time', 'end_time', 'role_label', 'location_id', 'date'];
    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('shift_schedules')
      .update(updates)
      .eq('id', id)
      .eq('business_id', req.user.business_id)
      .select(`*, user:users!user_id(id, name, email), location:locations!location_id(id, name)`)
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    logger.error({ err }, 'Update shift error');
    res.status(500).json({ error: 'Failed to update shift' });
  }
});

/**
 * DELETE /api/hr/schedules/:id
 * Delete a shift schedule
 */
router.delete('/schedules/:id', authGuard, permissionCheck('manage_users'), async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from('shift_schedules')
      .delete()
      .eq('id', id)
      .eq('business_id', req.user.business_id);

    if (error) throw error;
    res.json({ message: 'Shift deleted' });
  } catch (err) {
    logger.error({ err }, 'Delete shift error');
    res.status(500).json({ error: 'Failed to delete shift' });
  }
});

// ============================================
// COMMISSION RULES ROUTES
// ============================================

/**
 * GET /api/hr/commission-rules
 */
router.get('/commission-rules', authGuard, async (req, res) => {
  try {
    let query = supabaseAdmin
      .from('commission_rules')
      .select('*')
      .order('created_at', { ascending: false });

    if (req.user.role !== 'Platform Admin') {
      query = query.eq('business_id', req.user.business_id);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json(data);
  } catch (err) {
    logger.error({ err }, 'Commission rules fetch error');
    res.status(500).json({ error: 'Failed to fetch commission rules' });
  }
});

/**
 * POST /api/hr/commission-rules
 */
router.post('/commission-rules', authGuard, permissionCheck('manage_business'), validateBody(commissionRuleSchema), async (req, res) => {
  try {
    const { name, type, value, min_sale_amount, product_category, active } = req.body;

    const { data, error } = await supabaseAdmin
      .from('commission_rules')
      .insert({
        business_id: req.user.business_id,
        name,
        type,
        value,
        min_sale_amount: min_sale_amount || 0,
        product_category: product_category || null,
        active: active !== false,
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    logger.error({ err }, 'Create commission rule error');
    res.status(500).json({ error: 'Failed to create commission rule' });
  }
});

/**
 * PATCH /api/hr/commission-rules/:id
 */
router.patch('/commission-rules/:id', authGuard, permissionCheck('manage_business'), async (req, res) => {
  try {
    const { id } = req.params;
    const allowedFields = ['name', 'type', 'value', 'min_sale_amount', 'product_category', 'active'];
    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('commission_rules')
      .update(updates)
      .eq('id', id)
      .eq('business_id', req.user.business_id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    logger.error({ err }, 'Update commission rule error');
    res.status(500).json({ error: 'Failed to update commission rule' });
  }
});

/**
 * DELETE /api/hr/commission-rules/:id
 */
router.delete('/commission-rules/:id', authGuard, permissionCheck('manage_business'), async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from('commission_rules')
      .delete()
      .eq('id', id)
      .eq('business_id', req.user.business_id);

    if (error) throw error;
    res.json({ message: 'Commission rule deleted' });
  } catch (err) {
    logger.error({ err }, 'Delete commission rule error');
    res.status(500).json({ error: 'Failed to delete commission rule' });
  }
});

// ============================================
// COMMISSION LEDGER ROUTES
// ============================================

/**
 * GET /api/hr/commissions
 * Per-user commission summary for a date range
 */
router.get('/commissions', authGuard, async (req, res) => {
  try {
    const { page, limit, offset } = getPagination(req.query);
    const { userId, startDate, endDate, unpaidOnly } = req.query;

    let query = supabaseAdmin
      .from('commission_ledger')
      .select(`
        *,
        user:users!user_id(id, name, email),
        rule:commission_rules!rule_id(id, name, type, value),
        sale:sales!sale_id(id, receipt_number, total_amount)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (req.user.role !== 'Platform Admin') {
      query = query.eq('business_id', req.user.business_id);
    }

    // Non-managers can only see their own commissions
    const isManager = ['Manager', 'Admin', 'Business Admin', 'Platform Admin'].includes(req.user.role);
    if (!isManager) {
      query = query.eq('user_id', req.user.id);
    } else if (userId) {
      query = query.eq('user_id', userId);
    }

    if (startDate) query = query.gte('created_at', startDate);
    if (endDate) query = query.lte('created_at', endDate);
    if (unpaidOnly === 'true') query = query.is('paid_at', null);

    const { data, error, count } = await query;
    if (error) throw error;

    // Compute summary
    const totalEarned = (data || []).reduce((sum, c) => sum + Number(c.amount), 0);
    const totalPaid = (data || []).filter(c => c.paid_at).reduce((sum, c) => sum + Number(c.amount), 0);
    const totalUnpaid = totalEarned - totalPaid;

    res.json({
      data,
      summary: { totalEarned, totalPaid, totalUnpaid },
      ...buildPaginationMeta(count, page, limit),
    });
  } catch (err) {
    logger.error({ err }, 'Commission list error');
    res.status(500).json({ error: 'Failed to fetch commissions' });
  }
});

/**
 * POST /api/hr/commissions/payout
 * Mark commissions as paid
 */
router.post('/commissions/payout', authGuard, permissionCheck('manage_business'), validateBody(payoutSchema), async (req, res) => {
  try {
    const { user_id, commission_ids } = req.body;
    const paidAt = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('commission_ledger')
      .update({ paid_at: paidAt })
      .in('id', commission_ids)
      .eq('user_id', user_id)
      .eq('business_id', req.user.business_id)
      .is('paid_at', null)
      .select();

    if (error) throw error;

    const totalPaid = (data || []).reduce((sum, c) => sum + Number(c.amount), 0);

    // Create a ledger entry for the payout
    if (totalPaid > 0 && req.user.active_location_id) {
      await supabaseAdmin
        .from('business_ledger')
        .insert({
          business_id: req.user.business_id,
          location_id: req.user.active_location_id,
          entry_type: 'expense',
          amount: totalPaid,
          description: `Commission payout to staff`,
          created_by: req.user.id,
        })
        .select();
    }

    res.json({
      message: `${data.length} commission(s) marked as paid`,
      total_paid: totalPaid,
      records: data,
    });
  } catch (err) {
    logger.error({ err }, 'Commission payout error');
    res.status(500).json({ error: 'Failed to process payout' });
  }
});

// ============================================
// PAYROLL EXPORT
// ============================================

/**
 * GET /api/hr/payroll-export
 * Aggregates hours + commissions per user; returns CSV or JSON
 */
router.get('/payroll-export', authGuard, permissionCheck('manage_business'), async (req, res) => {
  try {
    const { startDate, endDate, format } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    // Fetch attendance for the period
    const { data: attendance } = await supabaseAdmin
      .from('attendance_logs')
      .select('user_id, duration_minutes')
      .eq('business_id', req.user.business_id)
      .gte('clock_in', startDate)
      .lte('clock_in', endDate)
      .not('clock_out', 'is', null);

    // Fetch commissions for the period
    const { data: commissions } = await supabaseAdmin
      .from('commission_ledger')
      .select('user_id, amount, paid_at')
      .eq('business_id', req.user.business_id)
      .gte('created_at', startDate)
      .lte('created_at', endDate);

    // Fetch users
    const { data: users } = await supabaseAdmin
      .from('users')
      .select('id, name, email')
      .eq('business_id', req.user.business_id)
      .eq('status', 'active');

    // Aggregate
    const payroll = (users || []).map(u => {
      const userAttendance = (attendance || []).filter(a => a.user_id === u.id);
      const userCommissions = (commissions || []).filter(c => c.user_id === u.id);
      const totalMinutes = userAttendance.reduce((sum, a) => sum + (a.duration_minutes || 0), 0);
      const totalHours = (totalMinutes / 60).toFixed(1);
      const commissionEarned = userCommissions.reduce((sum, c) => sum + Number(c.amount), 0);
      const commissionPaid = userCommissions.filter(c => c.paid_at).reduce((sum, c) => sum + Number(c.amount), 0);
      const commissionUnpaid = commissionEarned - commissionPaid;

      return {
        name: u.name,
        email: u.email,
        hours_worked: Number(totalHours),
        shifts: userAttendance.length,
        commission_earned: commissionEarned,
        commission_paid: commissionPaid,
        commission_unpaid: commissionUnpaid,
      };
    });

    if (format === 'csv') {
      const headers = 'Name,Email,Hours Worked,Shifts,Commission Earned,Commission Paid,Commission Unpaid\n';
      const rows = payroll.map(r =>
        `"${r.name}","${r.email}",${r.hours_worked},${r.shifts},${r.commission_earned.toFixed(2)},${r.commission_paid.toFixed(2)},${r.commission_unpaid.toFixed(2)}`
      ).join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=payroll_${startDate}_${endDate}.csv`);
      return res.send(headers + rows);
    }

    res.json({ period: { startDate, endDate }, payroll });
  } catch (err) {
    logger.error({ err }, 'Payroll export error');
    res.status(500).json({ error: 'Failed to generate payroll export' });
  }
});

// ============================================
// GEOFENCE CONFIGURATION
// ============================================

/**
 * GET /api/hr/geofence/:locationId
 * Get geofence settings for a location
 */
router.get('/geofence/:locationId', authGuard, async (req, res) => {
  try {
    const { locationId } = req.params;
    const { data, error } = await supabaseAdmin
      .from('locations')
      .select('id, name, latitude, longitude, geofence_radius_m, clock_in_start, clock_in_end, clock_out_start, clock_out_end')
      .eq('id', locationId)
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    logger.error({ err }, 'Geofence fetch error');
    res.status(500).json({ error: 'Failed to fetch geofence settings' });
  }
});

/**
 * PUT /api/hr/geofence/:locationId
 * Update geofence + time window settings for a location (admin only)
 */
router.put('/geofence/:locationId', authGuard, permissionCheck('manage_business'), async (req, res) => {
  try {
    const { locationId } = req.params;
    const { latitude, longitude, geofence_radius_m, clock_in_start, clock_in_end, clock_out_start, clock_out_end } = req.body;

    const updates = {};
    if (latitude !== undefined) updates.latitude = latitude;
    if (longitude !== undefined) updates.longitude = longitude;
    if (geofence_radius_m !== undefined) updates.geofence_radius_m = Math.max(50, Math.min(5000, parseInt(geofence_radius_m)));
    if (clock_in_start !== undefined) updates.clock_in_start = clock_in_start || null;
    if (clock_in_end !== undefined) updates.clock_in_end = clock_in_end || null;
    if (clock_out_start !== undefined) updates.clock_out_start = clock_out_start || null;
    if (clock_out_end !== undefined) updates.clock_out_end = clock_out_end || null;

    const { data, error } = await supabaseAdmin
      .from('locations')
      .update(updates)
      .eq('id', locationId)
      .select('id, name, latitude, longitude, geofence_radius_m, clock_in_start, clock_in_end, clock_out_start, clock_out_end')
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    logger.error({ err }, 'Geofence update error');
    res.status(500).json({ error: 'Failed to update geofence settings' });
  }
});

module.exports = router;
