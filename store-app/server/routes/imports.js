const express = require('express');
const { z } = require('zod');
const logger = require('../utils/logger');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');
const permissionCheck = require('../middleware/permissionCheck');
const { validateBody } = require('../middleware/validate');
const { getPagination } = require('../utils/paginate');
const upload = require('../middleware/upload');
const { parseFile, applyColumnMapping, suggestColumnMapping } = require('../services/importParser');
const { VALIDATORS, TARGET_FIELDS } = require('../services/importValidators');
const { commitProductRow } = require('../services/importCommitters/products');
const { commitCustomerRow } = require('../services/importCommitters/customers');
const { commitSupplierRow } = require('../services/importCommitters/suppliers');

const router = express.Router();

const COMMITTERS = {
  products: commitProductRow,
  customers: commitCustomerRow,
  suppliers: commitSupplierRow,
};

const ENTITY_TYPES = ['products', 'customers', 'suppliers'];

const validateRequestSchema = z.object({
  entity_type: z.enum(ENTITY_TYPES),
  column_mapping: z.record(z.string(), z.string()),
  rows: z.array(z.record(z.string(), z.any())),
});

const commitRequestSchema = validateRequestSchema.extend({
  source_filename: z.string(),
});

/**
 * POST /api/imports/preview
 * Multipart upload — parses the file's headers + full row set and returns
 * a fuzzy-matched suggested column mapping. Nothing is persisted yet; the
 * client holds the parsed rows in memory through map -> validate -> commit.
 */
router.post('/preview', authGuard, permissionCheck('manage_financials'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    const { entity_type } = req.body;
    if (!ENTITY_TYPES.includes(entity_type)) {
      return res.status(400).json({ error: `entity_type must be one of: ${ENTITY_TYPES.join(', ')}` });
    }

    const { headers, rows } = await parseFile(req.file.buffer, req.file.originalname);
    if (rows.length === 0) {
      return res.status(400).json({ error: 'The uploaded file has no data rows.' });
    }

    const suggestedMapping = suggestColumnMapping(headers, TARGET_FIELDS[entity_type]);

    res.json({
      headers,
      rows,
      total_rows: rows.length,
      suggested_mapping: suggestedMapping,
      target_fields: TARGET_FIELDS[entity_type],
    });
  } catch (err) {
    logger.error({ err }, 'Error previewing import file:');
    res.status(400).json({ error: err.message || 'Failed to parse file.' });
  }
});

/**
 * POST /api/imports/validate
 * JSON body: { entity_type, column_mapping, rows }. Applies the mapping and
 * runs the entity's dry-run validator. Nothing is persisted.
 */
router.post('/validate', authGuard, permissionCheck('manage_financials'), validateBody(validateRequestSchema), async (req, res) => {
  try {
    const { entity_type, column_mapping, rows } = req.body;
    const mappedRows = applyColumnMapping(rows, column_mapping);
    const { valid, errors, warnings } = await VALIDATORS[entity_type](mappedRows, req.user.business_id);

    res.json({
      total_rows: rows.length,
      valid_count: valid.length,
      error_count: errors.length,
      warning_count: warnings.length,
      errors,
      warnings,
      preview: valid.slice(0, 20),
    });
  } catch (err) {
    logger.error({ err }, 'Error validating import:');
    res.status(500).json({ error: 'Failed to validate import.' });
  }
});

/**
 * POST /api/imports/commit
 * JSON body: { entity_type, source_filename, column_mapping, rows }.
 * Re-validates server-side (never trusts a client-reported "this is
 * valid"), then commits each valid row independently — one bad row (e.g. a
 * race-condition duplicate) must not roll back hundreds of good ones.
 */
router.post('/commit', authGuard, permissionCheck('manage_financials'), validateBody(commitRequestSchema), async (req, res) => {
  try {
    const { entity_type, source_filename, column_mapping, rows } = req.body;
    const mappedRows = applyColumnMapping(rows, column_mapping);
    const { valid, errors: validationErrors } = await VALIDATORS[entity_type](mappedRows, req.user.business_id);

    const { data: batch, error: batchErr } = await supabaseAdmin
      .from('import_batches')
      .insert([{
        business_id: req.user.business_id,
        entity_type,
        source_filename,
        status: 'committing',
        total_rows: rows.length,
        column_mapping,
        created_by: req.user.id,
      }])
      .select()
      .single();

    if (batchErr) throw batchErr;

    const committer = COMMITTERS[entity_type];
    const outcomes = [];
    let successCount = 0;

    for (const row of valid) {
      try {
        const entity = await committer(row, {
          businessId: req.user.business_id,
          userId: req.user.id,
          importBatchId: batch.id,
        });
        outcomes.push({ row: row.row, success: true, entity_id: entity.id });
        successCount += 1;
      } catch (err) {
        logger.error({ err, row: row.row }, 'Error committing import row:');
        outcomes.push({ row: row.row, success: false, error: err.message || 'Unknown error' });
      }
    }

    const errorReport = [
      ...validationErrors,
      ...outcomes.filter(o => !o.success).map(o => ({ row: o.row, field: null, message: o.error })),
    ];

    const { data: updatedBatch, error: updateErr } = await supabaseAdmin
      .from('import_batches')
      .update({
        status: 'committed',
        success_count: successCount,
        error_count: errorReport.length,
        skipped_count: 0,
        error_report: errorReport,
        committed_at: new Date().toISOString(),
      })
      .eq('id', batch.id)
      .select()
      .single();

    if (updateErr) throw updateErr;

    res.status(201).json({ batch: updatedBatch, outcomes });
  } catch (err) {
    logger.error({ err }, 'Error committing import:');
    res.status(500).json({ error: 'Failed to commit import.' });
  }
});

/**
 * GET /api/imports/batches
 */
router.get('/batches', authGuard, permissionCheck('manage_financials'), async (req, res) => {
  try {
    const { page, limit, offset } = getPagination(req.query);

    let query = supabaseAdmin
      .from('import_batches')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (req.user.role !== 'Platform Admin') {
      query = query.eq('business_id', req.user.business_id);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({ data, total: count, page, totalPages: Math.ceil(count / limit) });
  } catch (err) {
    logger.error({ err }, 'Error fetching import batches:');
    res.status(500).json({ error: 'Failed to fetch import batches.' });
  }
});

/**
 * GET /api/imports/batches/:id
 */
router.get('/batches/:id', authGuard, permissionCheck('manage_financials'), async (req, res) => {
  try {
    let query = supabaseAdmin.from('import_batches').select('*').eq('id', req.params.id);
    if (req.user.role !== 'Platform Admin') query = query.eq('business_id', req.user.business_id);

    const { data, error } = await query.single();
    if (error || !data) return res.status(404).json({ error: 'Import batch not found.' });

    res.json(data);
  } catch (err) {
    logger.error({ err }, 'Error fetching import batch:');
    res.status(500).json({ error: 'Failed to fetch import batch.' });
  }
});

/**
 * POST /api/imports/batches/:id/undo
 * ?dry_run=true returns the same per-row outcome preview without executing
 * anything, used to populate an accurate confirm-dialog warning client-side.
 */
router.post('/batches/:id/undo', authGuard, permissionCheck('manage_financials'), async (req, res) => {
  try {
    const dryRun = req.query.dry_run === 'true';

    let batchQuery = supabaseAdmin.from('import_batches').select('id, business_id, status').eq('id', req.params.id);
    if (req.user.role !== 'Platform Admin') batchQuery = batchQuery.eq('business_id', req.user.business_id);
    const { data: batch, error: batchErr } = await batchQuery.single();
    if (batchErr || !batch) return res.status(404).json({ error: 'Import batch not found.' });

    if (batch.status === 'undone') {
      return res.status(400).json({ error: 'This batch has already been undone.' });
    }

    const { data, error } = await supabaseAdmin.rpc('undo_import_batch', {
      p_batch_id: req.params.id,
      p_user_id: req.user.id,
      p_dry_run: dryRun,
    });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    logger.error({ err }, 'Error undoing import batch:');
    res.status(500).json({ error: err.message || 'Failed to undo import batch.' });
  }
});

module.exports = router;
