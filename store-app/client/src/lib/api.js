import { supabase } from './supabase';
import { IS_MOCK } from './mockMode';
import { resolveMock } from './api.mock';
import { reportError } from './errorReporting';

const _envUrl = import.meta.env.VITE_API_URL;
export const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? 'http://localhost:3001/api' : (_envUrl ? (_envUrl.endsWith('/api') ? _envUrl : `${_envUrl}/api`) : '/api');
const HTTP_MESSAGES = {
  400: "That request wasn't valid. Check the form and try again.",
  401: 'Your session has expired. Please sign in again.',
  403: "You don't have permission to do that.",
  404: "We couldn't find what you were looking for.",
  409: 'That conflicts with existing data. Refresh and try again.',
  413: 'That file is too large to upload.',
  422: "Some of the information provided couldn't be processed.",
  429: 'Too many requests. Wait a moment and try again.',
  500: 'Something went wrong on our end. Please try again.',
  502: 'The server is unreachable right now. Please try again shortly.',
  503: 'The service is temporarily unavailable. Please try again shortly.',
  504: 'The server took too long to respond. Please try again.',
};

/**
 * Build an Error whose `message` is safe to render to a user, keeping the
 * technical detail on the object for logging.
 *
 * The endpoint and API host are deliberately kept OUT of `message`. They were
 * previously interpolated into it, so users saw strings like
 * "[Target: http://localhost:3001/api/...] Network Error ... Is the backend
 * running?" on screen.
 */
function apiError(message, { endpoint, status, cause, body } = {}) {
  const err = new Error(message, cause ? { cause } : undefined);
  err.userMessage = message;
  err.endpoint = endpoint;
  err.status = status;
  /* The parsed error body, when there was one. `message` is the part a user
     reads; some responses also carry a field the caller needs to act on, and
     until now those were parsed and thrown away. The resend-confirmation
     button reads `retryAfter` off a 429 to disable itself for the right
     number of seconds instead of guessing. */
  err.body = body;

  // Every API failure in the app funnels through here, which makes this the one
  // place worth reporting from, far better than patching ~70 call sites.
  //
  // 4xx below 500 are excluded deliberately: 401 on an expired session and 403
  // on a permission check are normal application flow, and reporting them would
  // bury real failures under routine noise. reportError handles the DEV console
  // itself and no-ops in production without a DSN.
  if (!status || status >= 500) {
    reportError(err, { endpoint, status: status ?? 'network' });
  } else if (import.meta.env.DEV) {
    console.error(`[api] ${status} ${API_BASE}${endpoint}`, cause || message);
  }

  return err;
}

/**
 * Base fetch wrapper that injects the Supabase JWT token.
 * This ensures the server can authenticate the request.
 */
async function fetchWithAuth(endpoint, options = {}) {
  // Fixture short-circuit for the visual harness. Compiled out unless
  // VITE_USE_MOCKS is set, see src/lib/mockMode.js.
  if (IS_MOCK) {
    /* The parsed body goes with it so a write fixture can echo back what was
       submitted, and a record created in the harness carries the name that was
       actually typed. postFile sends FormData, which has no JSON body and is
       passed as undefined. */
    let mockBody;
    if (typeof options.body === 'string') {
      try { mockBody = JSON.parse(options.body); } catch { mockBody = undefined; }
    }
    const { hit, data } = resolveMock(endpoint, options.method || 'GET', mockBody);
    if (hit) return data;
  }

  // Get current session token
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  if (!token) {
    throw new Error('No authentication token found. Please sign in again.');
  }

  const activeLocationId = localStorage.getItem('active_location_id');
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;

  const headers = {
    // Omit Content-Type for FormData bodies, the browser must set its own
    // multipart/form-data boundary, which we can't replicate here.
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    'Authorization': `Bearer ${token}`,
    ...(activeLocationId ? { 'X-Location-Id': activeLocationId } : {}),
    ...(options.headers || {}),
  };

  let response;

  try {
    response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });
  } catch (networkErr) {
    throw apiError(
      navigator.onLine === false
        ? "You're offline. Reconnect and try again."
        : "Couldn't reach the server. Check your connection and try again.",
      { endpoint, cause: networkErr },
    );
  }

  // Handle standard HTTP errors
  if (!response.ok) {
    let errorMessage = HTTP_MESSAGES[response.status] || `Something went wrong (error ${response.status}).`;
    try {
      const errorData = await response.json();
      // Prefer the server's own message, it's written for users.
      errorMessage = errorData.message || errorData.error || errorMessage;
    } catch {
      // Not JSON
    }
    throw apiError(errorMessage, { endpoint, status: response.status });
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return null;
  }

  return response.json();
}

/**
 * GETs that are already in flight, keyed by endpoint.
 *
 * Independent components fetch the same reference data on mount, /locations
 * has eleven callers, and mounting two of them in the same frame fired the
 * same request twice. On the demo's first paint that showed up as /locations
 * being fetched, then fetched again the moment the first one landed.
 *
 * This shares the pending promise rather than caching the result: the entry is
 * dropped as soon as the request settles, so a later call still goes to the
 * network and nothing here can serve stale data. GET only, replaying a POST
 * is not a de-duplication, it is a lost write.
 */
const inFlightGets = new Map();

function dedupedGet(endpoint) {
  const pending = inFlightGets.get(endpoint);
  if (pending) return pending;

  const request = fetchWithAuth(endpoint, { method: 'GET' })
    .finally(() => inFlightGets.delete(endpoint));

  inFlightGets.set(endpoint, request);
  return request;
}

export const api = {
  get: (endpoint) => dedupedGet(endpoint),
  post: (endpoint, body) => fetchWithAuth(endpoint, { method: 'POST', body: JSON.stringify(body) }),
  put: (endpoint, body) => fetchWithAuth(endpoint, { method: 'PUT', body: JSON.stringify(body) }),
  /* PATCH was missing while useHR called api.patch for both
     PATCH /hr/schedules/:id and PATCH /hr/commission-rules/:id, which the
     server does implement. Editing a shift or a commission rule threw
     "api.patch is not a function" inside the hook's try, so it surfaced as a
     save failure rather than as a missing method. */
  patch: (endpoint, body) => fetchWithAuth(endpoint, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (endpoint) => fetchWithAuth(endpoint, { method: 'DELETE' }),
  // For multipart uploads, pass a FormData instance, never JSON.stringify it.
  postFile: (endpoint, formData) => fetchWithAuth(endpoint, { method: 'POST', body: formData }),
  // For binary downloads (the business data export ZIP).
  getBlob: (endpoint) => fetchBlobWithAuth(endpoint),
};

/**
 * GET a binary response as a Blob.
 *
 * Separate from `api.get` because that parses JSON, which would corrupt a ZIP.
 * And it has to go through fetch rather than a plain <a href> or window.open:
 * the endpoint requires an Authorization header, which a link cannot carry, so
 * a direct navigation would simply 401.
 */
async function fetchBlobWithAuth(endpoint) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw apiError(HTTP_MESSAGES[401], { endpoint, status: 401 });

  let response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (cause) {
    // Same wording as fetchWithAuth, so a network failure reads identically
    // wherever it happens.
    throw apiError(
      navigator.onLine === false
        ? "You're offline. Reconnect and try again."
        : "Couldn't reach the server. Check your connection and try again.",
      { endpoint, cause },
    );
  }

  if (!response.ok) {
    // The error body is JSON even though the success body is binary.
    let message = HTTP_MESSAGES[response.status] || `Request failed (${response.status}).`;
    try {
      const body = await response.json();
      if (body?.message) message = body.message;
    } catch { /* not JSON, keep the status-based message */ }
    throw apiError(message, { endpoint, status: response.status });
  }

  return response.blob();
}

/**
 * POST to a public endpoint, signup, demo login, where there is no session
 * yet, so `fetchWithAuth` would throw before it ever reached the network.
 *
 * Throws the same shape of error as `api.*` (a user-safe `message`), so
 * callers can render `err.message` without special-casing.
 */
export async function postPublic(endpoint, body) {
  let response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (networkErr) {
    throw apiError(
      navigator.onLine === false
        ? "You're offline. Reconnect and try again."
        : "Couldn't reach the server. Check your connection and try again.",
      { endpoint, cause: networkErr },
    );
  }

  if (!response.ok) {
    let errorMessage = HTTP_MESSAGES[response.status] || `Something went wrong (error ${response.status}).`;
    let errorBody;
    try {
      const errorData = await response.json();
      errorBody = errorData;
      // Zod validation errors come back as a details[] rather than a message.
      if (Array.isArray(errorData.details) && errorData.details.length > 0) {
        errorMessage = errorData.details.map(d => d.message).join(' ');
      } else {
        errorMessage = errorData.message || errorData.error || errorMessage;
      }
    } catch {
      // Not JSON
    }
    throw apiError(errorMessage, { endpoint, status: response.status, body: errorBody });
  }

  return response.status === 204 ? null : response.json();
}

// Unauthenticated lookup used to brand the login page on a business's
// subdomain, there is no session yet at that point, so this bypasses
// fetchWithAuth entirely. Returns null if the slug doesn't resolve.
export async function getBusinessBySlug(slug) {
  try {
    const response = await fetch(`${API_BASE}/businesses/by-slug/${encodeURIComponent(slug)}`);
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}
