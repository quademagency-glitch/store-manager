const { supabaseAdmin } = require('../db/supabase');

/**
 * Loss Prevention Detection Engine
 * Runs after key events (voids, sales with discounts, stock adjustments)
 * to detect suspicious patterns and auto-generate alerts.
 */

/**
 * Check for suspicious void patterns for a user.
 * Triggered after each void.
 */
async function checkVoidPatterns(userId, businessId, locationId) {
  try {
    // Get voids by this user in the last 8 hours
    const eightHoursAgo = new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString();

    const { data: recentVoids, error } = await supabaseAdmin
      .from('sales')
      .select('id, total_amount, created_at')
      .eq('salesperson_id', userId)
      .eq('business_id', businessId)
      .in('status', ['voided', 'void_pending'])
      .gte('created_at', eightHoursAgo);

    if (error || !recentVoids) return;

    // Pattern 1: High void rate (> 3 voids in 8hrs)
    if (recentVoids.length > 3) {
      // Check if we already fired this alert recently (avoid duplicates)
      const { data: existingAlert } = await supabaseAdmin
        .from('alerts')
        .select('id')
        .eq('user_id', userId)
        .eq('type', 'SUSPICIOUS_PATTERN')
        .gte('created_at', eightHoursAgo)
        .limit(1)
        .single();

      if (!existingAlert) {
        const { data: userData } = await supabaseAdmin
          .from('users')
          .select('name, email')
          .eq('id', userId)
          .single();

        await supabaseAdmin.from('alerts').insert([{
          business_id: businessId,
          location_id: locationId,
          type: 'SUSPICIOUS_PATTERN',
          severity: 'critical',
          user_id: userId,
          note: `High void rate: ${userData?.name || userData?.email || 'Staff'} voided ${recentVoids.length} sales in the last 8 hours.`,
          metadata: {
            pattern: 'high_void_rate',
            void_count: recentVoids.length,
            void_ids: recentVoids.map(v => v.id),
            total_value: recentVoids.reduce((sum, v) => sum + Number(v.total_amount || 0), 0),
            period: '8h'
          }
        }]);
      }
    }

    // Pattern 2: Repeated small voids (3+ voids under $20)
    const smallVoids = recentVoids.filter(v => Number(v.total_amount) < 20);
    if (smallVoids.length >= 3) {
      const { data: existingSmall } = await supabaseAdmin
        .from('alerts')
        .select('id')
        .eq('user_id', userId)
        .eq('type', 'SUSPICIOUS_PATTERN')
        .gte('created_at', eightHoursAgo)
        .single();

      if (!existingSmall) {
        await supabaseAdmin.from('alerts').insert([{
          business_id: businessId,
          location_id: locationId,
          type: 'SUSPICIOUS_PATTERN',
          severity: 'medium',
          user_id: userId,
          note: `Repeated small voids: ${smallVoids.length} voids under $20 in the last 8 hours.`,
          metadata: {
            pattern: 'small_void_cluster',
            void_count: smallVoids.length,
            void_ids: smallVoids.map(v => v.id)
          }
        }]);
      }
    }
  } catch (err) {
    console.error('Loss prevention - void pattern check error:', err);
  }
}

/**
 * Check for excessive discount patterns.
 * Triggered after each sale with a discount.
 */
async function checkDiscountPatterns(userId, businessId, locationId) {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Get all sales by this user today
    const { data: todaySales } = await supabaseAdmin
      .from('sales')
      .select('id, total_amount, discount_amount')
      .eq('salesperson_id', userId)
      .eq('business_id', businessId)
      .eq('status', 'completed')
      .gte('created_at', todayStart.toISOString());

    if (!todaySales || todaySales.length === 0) return;

    const totalRevenue = todaySales.reduce((sum, s) => sum + Number(s.total_amount || 0), 0);
    const totalDiscounts = todaySales.reduce((sum, s) => sum + Number(s.discount_amount || 0), 0);

    // Pattern: Discounts > 20% of revenue
    if (totalRevenue > 0 && (totalDiscounts / (totalRevenue + totalDiscounts)) > 0.20) {
      const { data: existing } = await supabaseAdmin
        .from('alerts')
        .select('id')
        .eq('user_id', userId)
        .eq('type', 'SUSPICIOUS_PATTERN')
        .gte('created_at', todayStart.toISOString())
        .limit(1);

      if (!existing || existing.length === 0) {
        await supabaseAdmin.from('alerts').insert([{
          business_id: businessId,
          location_id: locationId,
          type: 'SUSPICIOUS_PATTERN',
          severity: 'high',
          user_id: userId,
          note: `Excessive discounts: ${((totalDiscounts / (totalRevenue + totalDiscounts)) * 100).toFixed(1)}% of gross sales value given as discounts today.`,
          metadata: {
            pattern: 'excessive_discounts',
            total_revenue: totalRevenue,
            total_discounts: totalDiscounts,
            discount_rate: (totalDiscounts / (totalRevenue + totalDiscounts) * 100).toFixed(1),
            sale_count: todaySales.length
          }
        }]);
      }
    }
  } catch (err) {
    console.error('Loss prevention - discount pattern check error:', err);
  }
}

/**
 * Check if an action is happening outside business hours.
 */
async function checkAfterHours(userId, businessId, locationId, actionDescription) {
  try {
    // Get business settings
    const { data: business } = await supabaseAdmin
      .from('businesses')
      .select('business_hours_start, business_hours_end, business_timezone')
      .eq('id', businessId)
      .single();

    if (!business || !business.business_hours_start || !business.business_hours_end) return;

    // Get current time in business timezone
    const now = new Date();
    const tz = business.business_timezone || 'UTC';
    const localTime = new Date(now.toLocaleString('en-US', { timeZone: tz }));
    const currentHour = localTime.getHours();
    const currentMinute = localTime.getMinutes();
    const currentTime = currentHour * 60 + currentMinute;

    const [startH, startM] = business.business_hours_start.split(':').map(Number);
    const [endH, endM] = business.business_hours_end.split(':').map(Number);
    const startTime = startH * 60 + (startM || 0);
    const endTime = endH * 60 + (endM || 0);

    const isOutsideHours = currentTime < startTime || currentTime > endTime;

    if (isOutsideHours) {
      await supabaseAdmin.from('alerts').insert([{
        business_id: businessId,
        location_id: locationId,
        type: 'AFTER_HOURS',
        severity: 'medium',
        user_id: userId,
        note: `After-hours activity: ${actionDescription} at ${localTime.toLocaleTimeString('en-US')} (Business hours: ${business.business_hours_start}-${business.business_hours_end})`,
        metadata: {
          pattern: 'after_hours',
          action: actionDescription,
          local_time: localTime.toISOString(),
          business_hours: `${business.business_hours_start}-${business.business_hours_end}`
        }
      }]);
    }
  } catch (err) {
    console.error('Loss prevention - after hours check error:', err);
  }
}

/**
 * Check for shrinkage spikes at a location.
 * Triggered after each shrinkage adjustment.
 */
async function checkShrinkageSpike(businessId, locationId) {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // 7-day shrinkage
    const { data: recentShrinkage } = await supabaseAdmin
      .from('stock_movements')
      .select('quantity_change')
      .eq('business_id', businessId)
      .eq('location_id', locationId)
      .eq('movement_type', 'SHRINKAGE')
      .gte('created_at', sevenDaysAgo);

    // 30-day shrinkage
    const { data: monthShrinkage } = await supabaseAdmin
      .from('stock_movements')
      .select('quantity_change')
      .eq('business_id', businessId)
      .eq('location_id', locationId)
      .eq('movement_type', 'SHRINKAGE')
      .gte('created_at', thirtyDaysAgo);

    if (!recentShrinkage || !monthShrinkage) return;

    const weekTotal = recentShrinkage.reduce((sum, m) => sum + Math.abs(m.quantity_change), 0);
    const monthTotal = monthShrinkage.reduce((sum, m) => sum + Math.abs(m.quantity_change), 0);
    const monthAvgPerWeek = monthTotal / 4.3; // ~4.3 weeks in a month

    // Spike: 7-day > 2× 30-day weekly average
    if (monthAvgPerWeek > 0 && weekTotal > monthAvgPerWeek * 2) {
      const { data: existing } = await supabaseAdmin
        .from('alerts')
        .select('id')
        .eq('business_id', businessId)
        .eq('location_id', locationId)
        .eq('type', 'SUSPICIOUS_PATTERN')
        .gte('created_at', sevenDaysAgo)
        .limit(1);

      if (!existing || existing.length === 0) {
        await supabaseAdmin.from('alerts').insert([{
          business_id: businessId,
          location_id: locationId,
          type: 'SUSPICIOUS_PATTERN',
          severity: 'high',
          note: `Shrinkage spike: ${weekTotal} units lost in the last 7 days (weekly average: ${monthAvgPerWeek.toFixed(0)} units).`,
          metadata: {
            pattern: 'shrinkage_spike',
            week_total: weekTotal,
            month_avg_per_week: monthAvgPerWeek.toFixed(0),
            ratio: (weekTotal / monthAvgPerWeek).toFixed(1)
          }
        }]);
      }
    }
  } catch (err) {
    console.error('Loss prevention - shrinkage spike check error:', err);
  }
}

/**
 * Main entry point — run all applicable checks.
 * Called from sales.js and stock.js after key events.
 */
async function runChecks(event, { userId, businessId, locationId }) {
  try {
    switch (event) {
      case 'void':
        await checkVoidPatterns(userId, businessId, locationId);
        await checkAfterHours(userId, businessId, locationId, 'Sale void');
        break;
      case 'discount':
        await checkDiscountPatterns(userId, businessId, locationId);
        break;
      case 'sale':
        await checkAfterHours(userId, businessId, locationId, 'Sale transaction');
        break;
      case 'shrinkage':
        await checkShrinkageSpike(businessId, locationId);
        await checkAfterHours(userId, businessId, locationId, 'Stock shrinkage adjustment');
        break;
      case 'adjustment':
        await checkAfterHours(userId, businessId, locationId, 'Stock adjustment');
        break;
    }
  } catch (err) {
    console.error('Loss prevention engine error:', err);
    // Never throw — detection failures shouldn't block operations
  }
}

module.exports = { runChecks };
