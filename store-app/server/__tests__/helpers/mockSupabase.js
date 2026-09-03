/**
 * Creates a chainable Supabase query mock.
 * Usage: supabaseAdmin.from('table').select(...).eq(...).single() → resolves to { data, error }
 */
function makeQueryMock(result = { data: [], error: null, count: 0 }, onMutate = null) {
  // The chain is itself a thenable so `await chain` resolves to result.
  // All chainable methods return the same chain so filters applied after range() still work.
  const chain = new Proxy(
    {
      then(resolve, reject) {
        return Promise.resolve(result).then(resolve, reject);
      },
      catch(reject) {
        return Promise.resolve(result).catch(reject);
      },
    },
    {
      get(target, prop) {
        if (prop === 'then' || prop === 'catch') return target[prop].bind(target);

        if (['select', 'eq', 'neq', 'in', 'not', 'order', 'range', 'limit',
             'filter', 'match', 'ilike', 'or', 'gte', 'lte', 'gt', 'lt',
             'is', 'contains', 'overlaps', 'textSearch'].includes(prop)) {
          return () => chain;
        }
        if (prop === 'single') return () => Promise.resolve(result.single ?? result);
        if (prop === 'maybeSingle') return () => Promise.resolve(result.single ?? result);
        /* Writes are reported to the caller so a test can assert what a route
           actually sent, not merely that it touched the table. Without this
           the row a handler builds is invisible to the suite, which is how a
           column can be added to a route and quietly never populated. */
        if (['insert', 'update', 'upsert', 'delete'].includes(prop)) {
          return (payload) => {
            if (onMutate) onMutate(prop, payload);
            return chain;
          };
        }
        return () => chain;
      },
    }
  );
  return chain;
}

/**
 * Build a mock supabaseAdmin object.
 *
 * @param {Object} overrides - per-table result overrides: `{ tableName: { data, error } }`.
 *   A table's override may instead be an **array** of results, consumed one
 *   per `from(table)` call and then repeating the last entry. Routes that
 *   query the same table more than once with different intent need this, *   `/api/auth/signup` reads `users` twice, first to reject a duplicate
 *   email (expects nothing) and later to confirm the profile trigger fired
 *   (expects a row), and a single fixed result cannot satisfy both.
 */
function buildMockSupabase(overrides = {}) {
  // Per-table cursors for array-style overrides.
  const calls = {};

  function resultFor(table, fallback) {
    const override = overrides[table];
    if (override === undefined) return fallback;
    if (!Array.isArray(override)) return override;

    const index = calls[table] ?? 0;
    calls[table] = index + 1;
    return override[Math.min(index, override.length - 1)];
  }

  const authUser = overrides._authUser ?? { id: 'user-uuid-123', email: 'test@example.com' };
  const defaultUser = {
    id: 'user-uuid-123',
    name: 'Test User',
    email: 'test@example.com',
    business_id: 'biz-uuid-123',
    status: 'active',
    role_id: 'role-uuid-123',
    roles: {
      name: 'Business Admin',
      permissions: [
        'manage_business', 'manage_users', 'manage_platform',
        'view_sales', 'create_sales', 'manage_inventory',
        'view_reports', 'manage_billing',
      ],
    },
    businesses: { status: 'active' },
    user_locations: [],
  };

  /* Every insert/update/upsert/delete the route performs, in order, as
     `{ table, op, payload }`. Read it to assert the shape of a written row. */
  const mutations = [];

  return {
    mutations,
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: authUser }, error: null }),
      signInWithPassword: jest.fn().mockResolvedValue({
        data: { user: authUser, session: { access_token: 'test-token', refresh_token: 'refresh-token' } },
        error: null,
      }),
      admin: {
        createUser: jest.fn().mockResolvedValue({ data: { user: authUser }, error: null }),
        /* Defaults to an UNCONFIRMED user: authUser carries no
           email_confirmed_at unless a test supplies one via _authUser.
           Routes that branch on confirmation therefore take the
           not-yet-confirmed path by default, which is the interesting one. */
        getUserById: jest.fn().mockResolvedValue({ data: { user: authUser }, error: null }),
        deleteUser: jest.fn().mockResolvedValue({ data: {}, error: null }),
        updateUserById: jest.fn().mockResolvedValue({ data: { user: authUser }, error: null }),
        generateLink: jest.fn().mockResolvedValue({
          data: { user: authUser, properties: { action_link: 'https://example.test/confirm' } },
          error: null,
        }),
      },
    },
    from: jest.fn((table) => {
      const fallback = table === 'users'
        ? { data: defaultUser, error: null }
        : { data: [], error: null, count: 0 };
      const tableResult = resultFor(table, fallback);
      return makeQueryMock(
        { ...tableResult, single: tableResult },
        (op, payload) => mutations.push({ table, op, payload }),
      );
    }),
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
    channel: jest.fn(() => ({ on: jest.fn().mockReturnThis(), subscribe: jest.fn() })),
  };
}

module.exports = { buildMockSupabase, makeQueryMock };
