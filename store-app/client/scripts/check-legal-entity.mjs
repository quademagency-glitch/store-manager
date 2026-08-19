/**
 * Reports which optional identity details the legal documents are publishing
 * without.
 *
 * This used to guard against placeholders reaching production: the fields were
 * `[TODO: ...]` strings, and an unfilled one printed literally inside the
 * contract. They are now null, and the documents omit the surrounding phrase
 * instead, so nothing is broken while they are unset and this check no longer
 * guards against anything.
 *
 * It still runs, because the reason to publish them has not gone away and
 * "we never got round to it" should stay visible rather than quietly becoming
 * permanent. It does NOT fail the build: blocking unrelated deploys over a
 * detail only the operator can supply is how a check gets deleted.
 *
 * Imports entity.js rather than parsing it. The previous version read the
 * source with a regex for `TODO(...)`, which stopped matching the moment the
 * representation changed. A check that has to be kept in step with the thing
 * it checks is a check that rots.
 */
import { ENTITY, OPTIONAL_IDENTITY, unresolved } from '../src/legal/entity.js';

const missing = unresolved();

if (missing.length === 0) {
  console.log('✓ legal entity check: all identity details published');
  process.exit(0);
}

const CONSEQUENCE = {
  registrationNumber:
    'Terms 1.1 and Privacy 1.1 identify the party by name and form only.',
  address:
    'Terms 23.2 offers a postal address on request instead of naming one.',
  dataControllerRegistration:
    'Privacy 1.3 is omitted. Registering is required by Act 843.',
};

const w = Math.max(...missing.map((f) => f.length));
console.warn(`
  ${ENTITY.legalName} is publishing without ${missing.length} identity detail${missing.length === 1 ? '' : 's'}.
  The documents read correctly; these are omitted, not broken.

${missing.map((f) => `    ${f.padEnd(w)}  ${CONSEQUENCE[f] ?? OPTIONAL_IDENTITY[f]}`).join('\n')}

  Set them in src/legal/entity.js and the wording returns on the next build.
`);
