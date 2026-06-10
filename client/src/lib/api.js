import { supabase } from './supabase';

const _envUrl = import.meta.env.VITE_API_URL;
const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? 'http://localhost:3001/api' : (_envUrl ? (_envUrl.endsWith('/api') ? _envUrl : `${_envUrl}/api`) : '/api');
/**
 * Base fetch wrapper that injects the Supabase JWT token.
 * This ensures the server can authenticate the request.
 */
async function fetchWithAuth(endpoint, options = {}) {
  // Get current session token
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  if (!token) {
    throw new Error('No authentication token found. Please sign in again.');
  }

  const activeLocationId = localStorage.getItem('active_location_id');

  const headers = {
    'Content-Type': 'application/json',
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
    throw new Error(`[Target: ${API_BASE}${endpoint}] Network Error: Could not reach the server. Is the backend running? (Details: ${networkErr.message})`, { cause: networkErr });
  }

  // Handle standard HTTP errors
  if (!response.ok) {
    let errorMessage = `HTTP error ${response.status}`;
    try {
      const errorData = await response.json();
      errorMessage = errorData.message || errorData.error || errorMessage;
    } catch {
      // Not JSON
    }
    throw new Error(`[Target: ${API_BASE}${endpoint}] ` + errorMessage);
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
};
