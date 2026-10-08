import { normalizePhone, resolveCountry } from './phone';

/**
 * "Share on WhatsApp": a wa.me link that opens WhatsApp on this device with
 * the message already typed. QuadERP sends nothing; the person checks the
 * message and presses send from the shop's own WhatsApp.
 *
 * Customer numbers are stored in E.164; supplier numbers may be typed in the
 * local format, so both are normalised against the shop's country. wa.me needs
 * the international number as digits only.
 */
export function whatsappUrl(phone, text, business) {
  const e164 = normalizePhone(phone, resolveCountry(business));
  return e164 ? `https://wa.me/${e164.replace(/^\+/, '')}?text=${encodeURIComponent(text)}` : null;
}

const PAYMENT = { cash: 'Cash', card: 'Card', mobile: 'Mobile Money', transfer: 'Bank transfer' };
const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || 'there';
const shop = (business) => business?.name || 'our shop';
const day = (value) => (value ? new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const MAX_LINES = 10;

/** @param {{ receipt: object, business: object, fmt: (n:number)=>string, link?: string|null }} args */
export function receiptMessage({ receipt, business, fmt, link = null }) {
  const items = receipt.sale_items || [];
  const lines = items.slice(0, MAX_LINES).map((i) => `${i.quantity} × ${i.product?.name || 'Item'} · ${fmt(Number(i.unit_price) * Number(i.quantity))}`);
  if (items.length > MAX_LINES) lines.push(`and ${items.length - MAX_LINES} more`);
  const paid = receipt.payment_method ? ` · Paid by ${PAYMENT[receipt.payment_method] || receipt.payment_method}` : '';
  return [
    `Hi ${firstName(receipt.customer?.name)}, thank you for shopping at ${shop(business)}.`,
    `Receipt ${receipt.receipt_number} · ${day(receipt.created_at || receipt.settled_at)}`,
    ...lines,
    `Total ${fmt(receipt.total_amount)}${paid}`,
    link ? `View your receipt (link expires in 30 days): ${link}` : null,
  ].filter(Boolean).join('\n');
}

export function reminderMessage({ name, number, outstanding, dueDate, business, fmt }) {
  const due = dueDate ? (new Date(dueDate) < new Date() ? `, which was due on ${day(dueDate)}` : `, due on ${day(dueDate)}`) : '';
  return [
    `Hi ${firstName(name)}, this is a friendly reminder from ${shop(business)}.`,
    `Invoice ${number} has ${fmt(outstanding)} outstanding${due}.`,
    'If you have already paid, thank you, and please ignore this message.',
  ].join('\n');
}

export function statementMessage({ name, period, summary, business, fmt }) {
  const lines = [
    `Hi ${firstName(name)}, here is your statement from ${shop(business)} for ${day(period?.from)} to ${day(period?.to)}.`,
    `Purchases: ${summary.purchaseCount} totalling ${fmt(summary.purchaseTotal)}`,
  ];
  if (Number(summary.arOutstanding) > 0) lines.push(`Balance outstanding: ${fmt(summary.arOutstanding)}`);
  if (Number(summary.depositBalance) > 0) lines.push(`Deposit held for you: ${fmt(summary.depositBalance)}`);
  lines.push('Reply here if anything looks wrong.');
  return lines.join('\n');
}

export function purchaseOrderMessage({ po, business }) {
  const items = po.items || [];
  const lines = items.slice(0, MAX_LINES).map((i) => `${i.quantity} × ${i.product?.name || i.product_name || 'Item'}`);
  if (items.length > MAX_LINES) lines.push(`and ${items.length - MAX_LINES} more lines`);
  return [
    `Hello${po.supplier?.contact_person ? ` ${firstName(po.supplier.contact_person)}` : ''}, purchase order ${po.po_number} from ${shop(business)}:`,
    ...lines,
    po.expected_date ? `Expected by ${day(po.expected_date)}.` : null,
    'Please confirm you can supply these. Thank you.',
  ].filter(Boolean).join('\n');
}
