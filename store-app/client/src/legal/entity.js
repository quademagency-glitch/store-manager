/**
 * The contracting party, in one place.
 *
 * Every operative clause in the Terms, the Privacy Policy and the Data
 * Processing Agreement refers back to this object. Legal documents that name
 * the provider inconsistently — "QuadERP" in one clause, a trading name in
 * another, nothing at all in the signature block — are the single most common
 * reason a small company's contract is unenforceable in practice: the other
 * side can argue it never knew who it was contracting with. Keeping the
 * identity here means it cannot drift between the three documents.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * OPERATOR: the TODO fields below must be filled in before these documents
 * carry any weight. They are not cosmetic.
 *
 *   • A contract needs an identifiable party. "QuadERP" is a product name.
 *     The party is the registered business behind it.
 *
 *   • In Ghana an "Enterprise" registered under the Registration of Business
 *     Names Act, 1962 (Act 151) is a SOLE PROPRIETORSHIP. It is not a separate
 *     legal person: its debts are the owner's debts, personally and without
 *     limit. The liability cap in clause 14 of the Terms limits what a customer
 *     can claim, but it does not put a company between a claim and the owner's
 *     own assets — only incorporating does that. Registering a company limited
 *     by shares with the Office of the Registrar of Companies under the
 *     Companies Act, 2019 (Act 992) is the cheapest meaningful legal
 *     protection available and costs a small fraction of a lawyer's fee.
 *     If you do that, update `type` and `registrationNumber` here.
 *
 *   • Ghana's Data Protection Act, 2012 (Act 843) requires a data controller
 *     to register with the Data Protection Commission. Processing personal
 *     data without registering is an offence under the Act. QuadERP holds
 *     customer, staff and attendance data for every tenant, so this applies.
 *     Register, then put the certificate number in `dataControllerRegistration`
 *     — a privacy policy that can name its registration is worth considerably
 *     more than one that cannot.
 *
 *   • `address` must be a real service address. Notices under clause 21 of the
 *     Terms, and any claim form, are delivered there.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** Marker for details the operator still has to supply. See `unresolved()`. */
const TODO = (hint) => `[TODO: ${hint}]`;

export const ENTITY = {
  /** Product name. Safe to use in prose; never sufficient as a party name. */
  product: 'QuadERP',

  /** The legal person that contracts with customers. */
  legalName: 'Quadem Digital Enterprise',

  /**
   * One of: 'sole proprietorship' | 'company limited by shares' | 'partnership'.
   * Drives the wording of the party description in each document, because a
   * sole proprietorship cannot honestly be described as "a company".
   */
  type: 'sole proprietorship',

  registrationNumber: TODO('Registrar-General / ORC registration number'),
  address: TODO('registered service address, including city and region'),
  country: 'Ghana',

  /** Registration under the Data Protection Act, 2012 (Act 843). */
  dataControllerRegistration: TODO('Data Protection Commission registration number'),

  email: {
    general: 'quadem.agency@gmail.com',
    privacy: 'quadem.agency@gmail.com',
    billing: 'billing@quaderp.com',
  },
};

/**
 * Document versions.
 *
 * Bump `version` whenever a clause changes meaning, and set `effective` to the
 * date the new version takes effect — not the date it was written. Clause 22
 * of the Terms promises notice before a material change takes effect, so those
 * two dates are normally different.
 *
 * `TERMS_VERSION` is also recorded against each account at signup, which is
 * what makes it possible to say later *which* version a given customer agreed
 * to. Without that record, "you accepted our terms" is an assertion rather than
 * a fact, and the whole agreement rests on it.
 */
export const TERMS_VERSION = '1.0';
export const PRIVACY_VERSION = '1.0';
export const DPA_VERSION = '1.0';

export const EFFECTIVE_DATE = '19 August 2026';

/** Governing law, referenced by all three documents so they cannot diverge. */
export const JURISDICTION = 'Ghana';

/**
 * Which entity fields are still placeholders.
 *
 * Used by the legal pages to render a visible, unmissable banner in
 * development. A silent placeholder is how "[TODO: registered address]" ends up
 * on a production contract, so this deliberately refuses to be subtle.
 */
export function unresolved() {
  return Object.entries(ENTITY)
    .filter(([, v]) => typeof v === 'string' && v.startsWith('[TODO:'))
    .map(([k]) => k);
}
