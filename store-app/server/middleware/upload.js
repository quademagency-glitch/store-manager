const multer = require('multer');

const ALLOWED_EXTENSIONS = ['.csv', '.xlsx', '.xls'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB — bulk imports are product/customer/supplier lists, not media
  fileFilter: (req, file, cb) => {
    const ok = ALLOWED_EXTENSIONS.some(ext => file.originalname.toLowerCase().endsWith(ext));
    cb(ok ? null : new Error('Only .csv, .xlsx, and .xls files are supported'), ok);
  },
});

module.exports = upload;
