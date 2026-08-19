/**
 * The contracting party, in one place.
 *
 * Every operative clause in the Terms, the Privacy Policy and the Data
 * Processing Agreement refers back to this object. Legal documents that name
 * the provider inconsistently ("QuadERP" in one clause, a trading name in
 * another, nothing at all in the signature block) are the single most common
 * reason a small company's contract is unenforceable in practice: the other
 * side can argue it never knew who it was contracting with. Keeping the
 * identity here means it cannot drift between the three documents.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * OPERATOR NOTES
 *
 * 1. THE OPTIONAL IDENTITY FIELDS (registrationNumber, address,
 *    dataControllerRegistration) ARE DELIBERATELY UNSET.
 *
 *    They were previously placeholders, which meant the published contract
 *    read "registered under number [TODO: ...]". Set to null instead, and the
 *    documents now omit the phrase entirely rather than printing a gap: see
 *    `identityPhrase` and the conditional blocks in Terms clause 1.1, Privacy
 *    clause 1.1 and the contact clauses. Fill any of them in and the wording
 *    reappears on the next build, with no edit to the documents themselves.
 *
 *    What is genuinely lost while they are unset:
 *      - The Terms cannot give a postal address for service, so clause 23.2
 *        offers one on request instead. A counterparty who wants to serve a
 *        formal notice has to ask for it first.
 *      - The Privacy Policy cannot cite a Data Protection Commission
 *        registration. Registering is a statutory duty under the Data
 *        Protection Act, 2012 (Act 843) for anyone processing personal data,
 *        and QuadERP holds customer, staff and attendance data for every
 *        tenant. A notice that can name its registration is worth
 *        considerably more than one that cannot.
 *
 * 2. `type` IS A RECORDED DECISION, NOT AN OVERSIGHT. Reviewed and kept as a
 *    sole proprietorship on 2026-08-19.
 *
 *    In Ghana an "Enterprise" registered under the Registration of Business
 *    Names Act, 1962 (Act 151) is a sole proprietorship. It is not a separate
 *    legal person: its debts are the owner's debts, personally and without
 *    limit. Clause 19 of the Terms caps what a customer can claim, but no
 *    company sits between that claim and the owner's own assets.
 *
 *    That trade-off has been considered and accepted. Please do not reopen it
 *    in review. If it is ever revisited, incorporating under the Companies
 *    Act, 2019 (Act 992) is the change, and `type` and `registrationNumber`
 *    here are what would need updating.
 * ─────────────────────────────────────────────────────────────────────────
 */

/**
 * Identity details that may be published but are not required for the
 * documents to read correctly. Anything null here is omitted from the prose
 * rather than rendered as a gap. `unresolved()` reports which are missing so a
 * build can nag without failing.
 */
export const OPTIONAL_IDENTITY = {
  registrationNumber: 'Registrar-General / ORC registration number',
  address: 'registered service address, including city and region',
  dataControllerRegistration: 'Data Protection Commission registration number',
};

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

  /** Optional. See OPTIONAL_IDENTITY and note 1 above before setting these. */
  registrationNumber: null,
  address: null,
  country: 'Ghana',

  /** Registration under the Data Protection Act, 2012 (Act 843). Optional. */
  dataControllerRegistration: null,

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
 * Which optional identity details are not published.
 *
 * Used by the build check to report what is missing, and by the legal pages to
 * show a development-only banner. Nothing here breaks a document: the prose
 * omits what is absent. It exists so that "we never got round to it" stays
 * visible rather than quietly becoming permanent.
 */
export function unresolved() {
  return Object.keys(OPTIONAL_IDENTITY).filter((k) => !ENTITY[k]);
}

/**
 * Renders "registered in Ghana under registration number X, of Y" with
 * whichever parts exist, and just "registered in Ghana" when neither does.
 *
 * Built here rather than inline in each document so the three cannot describe
 * the same party differently, which is the exact failure this module exists to
 * prevent. Returns a plain string; no dashes, per house style.
 */
export function identityPhrase() {
  const parts = [`registered in ${ENTITY.country}`];
  if (ENTITY.registrationNumber) parts.push(`under registration number ${ENTITY.registrationNumber}`);
  if (ENTITY.address) parts.push(`with its address at ${ENTITY.address}`);
  return parts.join(' ');
}

/** "Name, Address, Country" or "Name, Country" for the contact blocks. */
export function postalLine() {
  return [ENTITY.legalName, ENTITY.address, ENTITY.country].filter(Boolean).join(', ');
}
