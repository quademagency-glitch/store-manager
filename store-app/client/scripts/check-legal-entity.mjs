/**
 * Guards the contracting party details in src/legal/entity.js.
 *
 * The Terms, the Privacy Policy and the Data Processing Agreement all name the
 * provider by interpolating that file. While a field is still a placeholder,
 * the published contract literally reads "registered in Ghana under
 * registration number [TODO: ...]" — an agreement that cannot identify its own
 * party, which is the weakest kind there is.
 *
 * This does NOT fail the build. Failing it would block deploys of unrelated
 * work over a detail only the operator can supply, and a check that blocks
 * everything gets disabled. It prints a block loud enough to be seen in a
 * Vercel log instead, every single build, until the fields are filled in.
 *
 * Two of the three fields are worth chasing for their own sake, not just to
 * silence this:
 *
 *   • Registering as a data controller with Ghana's Data Protection
 *     Commission is a statutory duty under the Data Protection Act, 2012
 *     (Act 843), not a formality.
 *   • The registration number reveals whether the party is a company or a sole
 *     proprietorship — which decides whether the liability cap in clause 19 of
 *     the Terms sits in front of anyone's personal assets.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '../src/legal/entity.js'), 'utf8');

// Read the TODO hints straight out of the source rather than importing it:
// entity.js is an ES module the build pipeline owns, and a check that has to
// be kept in step with an import list is a check that rots.
const pending = [...src.matchAll(/^\s*(\w+):\s*TODO\('([^']+)'\)/gm)].map((m) => ({
  field: m[1],
  hint: m[2],
}));

if (pending.length === 0) {
  console.log('✓ legal entity check: contracting party fully identified');
  process.exit(0);
}

const w = Math.max(...pending.map((p) => p.field.length));
console.warn(`
┌──────────────────────────────────────────────────────────────────────────┐
│  LEGAL DOCUMENTS ARE INCOMPLETE                                          │
└──────────────────────────────────────────────────────────────────────────┘

  /terms, /privacy and /dpa are being built with ${pending.length} placeholder${pending.length === 1 ? '' : 's'}.
  Visitors will see the literal text "[TODO: ...]" in the contract.

${pending.map((p) => `    ${p.field.padEnd(w)}  ${p.hint}`).join('\n')}

  Fill these in at src/legal/entity.js, then rebuild.
`);
