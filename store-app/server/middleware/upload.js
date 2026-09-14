const multer = require('multer');

const ALLOWED_EXTENSIONS = ['.csv', '.xlsx', '.xls'];
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES }, // bulk imports are product/customer/supplier lists, not media
  fileFilter: (req, file, cb) => {
    const ok = ALLOWED_EXTENSIONS.some(ext => file.originalname.toLowerCase().endsWith(ext));
    cb(ok ? null : new Error('Only .csv, .xlsx and .xls files are supported.'), ok);
  },
});

/**
 * multer rejects a bad upload from inside the middleware chain, by calling
 * next(err). That skips the route's own try/catch and lands in the global
 * error handler in index.js, where a plain Error carries no status and falls
 * through to the generic branch. So the user who picked the wrong file type,
 * or a spreadsheet over the size limit, was told "Something went wrong.
 * Please try again." and never the one thing that would have helped.
 *
 * Answering here keeps the reason attached to the thing that rejected it.
 */
function singleFile(field) {
  const handler = upload.single(field);

  return (req, res, next) => handler(req, res, (err) => {
    if (!err) return next();

    const message = err.code === 'LIMIT_FILE_SIZE'
      ? 'That file is too large. The limit is 10MB, so split it into smaller files and import them one at a time.'
      : err.message || 'That file could not be accepted.';

    return res.status(400).json({ error: message });
  });
}

module.exports = upload;
module.exports.singleFile = singleFile;
module.exports.ALLOWED_EXTENSIONS = ALLOWED_EXTENSIONS;
