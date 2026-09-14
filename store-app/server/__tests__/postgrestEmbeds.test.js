const fs = require('fs');
const path = require('path');

/**
 * PostgREST embeds that no foreign key supports.
 *
 * A customer reported that a purchase order "goes missing after creating it".
 * It was never missing. GET /api/purchase-orders embedded
 * `creator:users!created_by` and `receiver:users!received_by`, but those two
 * columns are foreign keys to **auth.users**, not public.users, so PostgREST
 * had no relationship to follow and refused the request outright:
 *
 *   PGRST200  Could not find a relationship between 'purchase_orders'
 *             and 'users' in the schema cache
 *
 * One unresolvable embed fails the WHOLE select, so the list route and the
 * detail route both 500'd and the list was permanently empty. POST does not
 * embed users, so creating a PO worked and returned the new row, which is
 * what made it look like saving had silently lost it. Nothing rendered
 * `creator` or `receiver` anywhere in the client; they were dead weight that
 * broke the feature.
 *
 * Most tables here DO have a real foreign key to public.users, so
 * `users!some_column` is usually fine and a blanket ban would be wrong. These
 * are the only columns that point at auth.users instead, read from the live
 * schema on 2026-09-14:
 *
 *   select cl.relname, a.attname from pg_constraint con ... where
 *   con.contype='f' and confrelid='auth.users'::regclass;
 *
 * If a name is ever genuinely needed, read public.users separately by id
 * (public.users.id IS the auth user id) and stitch the two together.
 */
const AUTH_BACKED = {
  purchase_orders: ['created_by', 'received_by'],
  customer_orders: ['created_by'],
  price_change_log: ['changed_by'],
};

const ROOTS = ['routes', 'services'];

/** Every `.from('x') ... .select(`...`)` pair in a file, as [table, select]. */
function selectsIn(source) {
  const pairs = [];
  const re = /\.from\(\s*['"`](\w+)['"`]\s*\)\s*(?:\/\*[\s\S]*?\*\/\s*)*\.select\(\s*(['"`])([\s\S]*?)\2/g;
  let m;
  while ((m = re.exec(source)) !== null) pairs.push([m[1], m[3]]);
  return pairs;
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith('.js')) out.push(full);
  }
  return out;
}

describe('PostgREST embeds', () => {
  const serverRoot = path.resolve(__dirname, '..');
  const files = ROOTS.flatMap(r => walk(path.join(serverRoot, r)));

  it('finds route files to inspect, so a path change cannot make this vacuous', () => {
    expect(files.length).toBeGreaterThan(20);
    expect(selectsIn("supabaseAdmin.from('x').select(`a, b:c!d(e)`)")).toEqual([['x', 'a, b:c!d(e)']]);
  });

  it('never embeds public.users on a column that references auth.users', () => {
    const offenders = [];

    for (const file of files) {
      for (const [table, select] of selectsIn(fs.readFileSync(file, 'utf8'))) {
        for (const column of AUTH_BACKED[table] || []) {
          if (new RegExp(`users!${column}\\b`).test(select)) {
            offenders.push(`  ${path.relative(serverRoot, file)}: ${table} embeds users!${column}`);
          }
        }
      }
    }

    /* Jest's expect() takes one argument, unlike Playwright's, so the
       explanation is thrown rather than passed alongside the value. */
    if (offenders.length > 0) {
      throw new Error(
        'These columns are foreign keys to auth.users, not public.users, so PostgREST\n' +
        'answers PGRST200 and the ENTIRE select fails, not just the embed. The route\n' +
        'returns 500 and the list looks empty:\n' + offenders.join('\n'),
      );
    }
    expect(offenders).toEqual([]);
  });

  /* The two routes that actually broke, pinned by name so a rewrite that
     reintroduces the embed fails here even if the helper above is changed. */
  it('keeps the purchase order list and detail selects free of user embeds', () => {
    const source = fs.readFileSync(path.join(serverRoot, 'routes/purchaseOrders.js'), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '');

    expect(code).not.toMatch(/users!created_by/);
    expect(code).not.toMatch(/users!received_by/);
    // and the route still returns what the page renders
    for (const [, select] of selectsIn(code).filter(([t]) => t === 'purchase_orders')) {
      if (select.includes('items:')) expect(select).toMatch(/supplier:suppliers!supplier_id/);
    }
  });
});
