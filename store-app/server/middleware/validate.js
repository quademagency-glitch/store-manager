const { z } = require('zod');

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
