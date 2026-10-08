/**
 * One CSV cell, safe to open in a spreadsheet: always quoted, and text that a
 * spreadsheet would run as a formula (=, +, -, @, tab, CR) is prefixed with an
 * apostrophe. Names and emails are typed by staff and customers, so an export
 * an owner opens must never execute what someone else typed.
 */
function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

module.exports = { csvCell };
