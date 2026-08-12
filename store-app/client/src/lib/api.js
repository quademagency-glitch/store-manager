import { supabase } from './supabase';
import { IS_MOCK } from './mockMode';
import { resolveMock } from './api.mock';

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
 * The endpoint and API host are deliberately kept OUT of `message` — they were
 * previously interpolated into it, so users saw strings like
 * "[Target: http://localhost:3001/api/...] Network Error ... Is the backend
 * running?" on screen.
 */
function apiError(message, { endpoint, status, cause } = {}) {
  const err = new Error(message, cause ? { cause } : undefined);
  err.userMessage = message;
  err.endpoint = endpoint;
  err.status = status;
  if (import.meta.env.DEV) {
    console.error(`[api] ${status || 'network'} ${API_BASE}${endpoint}`, cause || message);
  }
  return err;
}

/**
 * Base fetch wrapper that injects the Supabase JWT token.
 * This ensures the server can authenticate the request.
 */
async function fetchWithAuth(endpoint, options = {}) {
  // Fixture short-circuit for the visual harness. Compiled out unless
  // VITE_USE_MOCKS is set — see src/lib/mockMode.js.
  if (IS_MOCK) {
    const { hit, data } = resolveMock(endpoint);
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
    // Omit Content-Type for FormData bodies — the browser must set its own
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
      // Prefer the server's own message — it's written for users.
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

export const api = {
  get: (endpoint) => fetchWithAuth(endpoint, { method: 'GET' }),
  post: (endpoint, body) => fetchWithAuth(endpoint, { method: 'POST', body: JSON.stringify(body) }),
  put: (endpoint, body) => fetchWithAuth(endpoint, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (endpoint) => fetchWithAuth(endpoint, { method: 'DELETE' }),
  // For multipart uploads — pass a FormData instance, never JSON.stringify it.
  postFile: (endpoint, formData) => fetchWithAuth(endpoint, { method: 'POST', body: formData }),
};

/**
 * POST to a public endpoint — signup, demo login — where there is no session
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
    try {
      const errorData = await response.json();
      // Zod validation errors come back as a details[] rather than a message.
      if (Array.isArray(errorData.details) && errorData.details.length > 0) {
        errorMessage = errorData.details.map(d => d.message).join(' ');
      } else {
        errorMessage = errorData.message || errorData.error || errorMessage;
      }
    } catch {
      // Not JSON
    }
    throw apiError(errorMessage, { endpoint, status: response.status });
  }

  return response.status === 204 ? null : response.json();
}

// Unauthenticated lookup used to brand the login page on a business's
// subdomain — there is no session yet at that point, so this bypasses
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
