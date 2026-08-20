/**
 * Which thermal roll this device prints on.
 *
 * Stored per device, not per business, because the printer belongs to the till.
 * A shop can perfectly well have an 80mm printer at the counter and a 58mm
 * handheld on the floor, and a single business-level setting would force one of
 * them to print wrong. It also means no migration, no API call, and no round
 * trip in the middle of finishing a sale.
 *
 * 80mm is the default because that is what the layout was built for and what
 * the previous behaviour effectively was, so nobody's receipts change until
 * they choose 58mm.
 */
const KEY = 'quaderp.receiptWidth';

export const RECEIPT_WIDTHS = ['80mm', '58mm'];

export function getReceiptWidth() {
  try {
    const v = localStorage.getItem(KEY);
    return RECEIPT_WIDTHS.includes(v) ? v : '80mm';
  } catch {
    // Private browsing, or storage disabled by policy. Printing should not be
    // the thing that breaks, so fall back rather than throw.
    return '80mm';
  }
}

export function setReceiptWidth(width) {
  if (!RECEIPT_WIDTHS.includes(width)) return;
  try {
    localStorage.setItem(KEY, width);
  } catch {
    // Nothing to do: the preference just will not persist past this session.
  }
}

/** The print.css class for a width. */
export function receiptFormatClass(width = getReceiptWidth()) {
  return width === '58mm' ? 'print-format-thermal-58' : 'print-format-thermal';
}
