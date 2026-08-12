/**
 * Default accounting templates for a newly created business.
 *
 * There are two paths that seed these and they must not fight:
 *
 *   1. The `on_business_created_seed_templates` trigger (migration 028) fires
 *      on every INSERT into businesses, so an operator-provisioned business
 *      already has its templates by the time any application code sees it.
 *   2. This module, called explicitly by self-service signup and by the
 *      `seedTemplates.js` backfill script.
 *
 * `seedAccountingTemplates` is therefore idempotent by design: it checks for
 * an existing template first and reports `{ seeded: false, reason: 'exists' }`
 * rather than duplicating what the trigger already inserted. Keeping the
 * explicit call is still worthwhile — it is the only thing that would notice
 * if the trigger were ever dropped.
 */

const { supabaseAdmin } = require('../db/supabase');
const logger = require('../utils/logger');

/**
 * The template set itself, parameterised only by business.
 * @param {string} businessId
 */
function buildDefaultTemplates(businessId) {
  return [
    {
      business_id: businessId,
      name: 'Mobile Money Deposit',
      description: 'Record deposits made via mobile money (MoMo, M-Pesa, etc).',
      type: 'deposit',
      assigned_roles: ['Cashier', 'Salesperson', 'Business Admin'],
      fields_schema: [
        { id: '1', label: 'Transaction Charges', type: 'number', required: false, options: '', showIf: '' },
      ],
    },
    {
      business_id: businessId,
      name: 'POS Machine Deposit',
      description: 'Record card payments settled from a POS machine.',
      type: 'deposit',
      assigned_roles: ['Cashier', 'Salesperson', 'Business Admin'],
      fields_schema: [
        { id: '2', label: 'POS Machine Name', type: 'dropdown', required: true, options: 'Stripe, Square, Clover, FirstData', showIf: '' },
        { id: '3', label: 'Transaction Charges', type: 'number', required: false, options: '', showIf: '' },
      ],
    },
    {
      business_id: businessId,
      name: 'Bank Deposit',
      description: 'Record physical cash deposited into a bank account.',
      type: 'deposit',
      assigned_roles: ['Cashier', 'Manager', 'Business Admin'],
      fields_schema: [
        { id: '4', label: 'Bank Name', type: 'dropdown', required: true, options: 'Chase, Bank of America, Wells Fargo, Citi', showIf: '' },
      ],
    },
    {
      business_id: businessId,
      name: 'General Expense',
      description: 'Record a standard business expense.',
      type: 'expense',
      assigned_roles: ['Cashier', 'Manager', 'Business Admin'],
      fields_schema: [
        { id: '5', label: 'Expense Category', type: 'dropdown', required: true, options: 'Office Supplies, Utilities, Maintenance, Travel, Meals, Marketing', showIf: '' },
      ],
    },
  ];
}

/**
 * Seed the default accounting templates for one business, unless it already
 * has some.
 *
 * Never throws: seeding templates is a convenience, and a business that
 * signed up successfully must not be rolled back because a template insert
 * failed. Callers that care can inspect the return value.
 *
 * @param {string} businessId
 * @returns {Promise<{ seeded: boolean, count?: number, reason?: string, error?: string }>}
 */
async function seedAccountingTemplates(businessId) {
  if (!businessId) return { seeded: false, reason: 'no-business-id' };

  try {
    const { data: existing, error: lookupError } = await supabaseAdmin
      .from('accounting_templates')
      .select('id')
      .eq('business_id', businessId)
      .limit(1);

    if (lookupError) {
      logger.warn({ err: lookupError, businessId }, 'Could not check for existing accounting templates');
      return { seeded: false, reason: 'lookup-failed', error: lookupError.message };
    }

    if (existing && existing.length > 0) {
      return { seeded: false, reason: 'exists' };
    }

    const templates = buildDefaultTemplates(businessId);
    const { error: insertError } = await supabaseAdmin.from('accounting_templates').insert(templates);

    if (insertError) {
      logger.warn({ err: insertError, businessId }, 'Failed to seed accounting templates');
      return { seeded: false, reason: 'insert-failed', error: insertError.message };
    }

    return { seeded: true, count: templates.length };
  } catch (err) {
    logger.warn({ err, businessId }, 'Unexpected error seeding accounting templates');
    return { seeded: false, reason: 'unexpected', error: err.message };
  }
}

module.exports = { seedAccountingTemplates, buildDefaultTemplates };
