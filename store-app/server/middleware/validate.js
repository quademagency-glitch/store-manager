const { z } = require('zod');
const logger = require('../utils/logger');

/**
 * Middleware to validate request body using a Zod schema.
 * @param {z.ZodSchema} schema - The Zod schema to validate against
 */
function validateBody(schema) {
  return (req, res, next) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        // Log the field paths and messages only — never err.issues wholesale.
        // Zod puts the offending value in `received`, so dumping the raw issues
        // writes user-submitted data (passwords, PINs, card refs) into the logs.
        logger.warn({
          reqId: req.id,
          path: req.path,
          issues: (err.issues ?? []).map(e => ({ field: e.path.join('.'), code: e.code })),
        }, 'Request body failed validation');
        return res.status(400).json({
          error: 'Validation Error',
          details: (err.issues ?? err.errors ?? []).map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        });
      }
      next(err);
    }
  };
}

module.exports = { validateBody };
