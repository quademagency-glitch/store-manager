import AsyncStorage from '@react-native-async-storage/async-storage';
import EventSource from 'react-native-sse';

export const API_BASE = 'https://app.quaderp.app/api';

const REQUEST_TIMEOUT_MS = 12000;

// Thrown when the server returns 401 — caller should unlink and redirect to setup
export class AuthExpiredError extends Error {
  constructor() {
    super('Session expired. Please re-link the scanner.');
    this.name = 'AuthExpiredError';
  }
}

async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Request timed out. Check your connection.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function handleResponse(response: Response): Promise<any> {
  if (response.status === 401 || response.status === 404) {
    await removeToken();
    throw new AuthExpiredError();
  }
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || errorData.error || `Server error (${response.status})`);
  }
  return response.json();
}

export const saveToken = async (token: string) => {
  await AsyncStorage.setItem('scanner_token', token);
};

export const getToken = async (): Promise<string | null> => {
  return AsyncStorage.getItem('scanner_token');
};

export const removeToken = async () => {
  const token = await AsyncStorage.getItem('scanner_token');
  if (token) {
    try {
      await fetchWithTimeout(`${API_BASE}/scanner/app-unlink`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
    } catch {
      // Best-effort unlink on backend
    }
  }
  await AsyncStorage.removeItem('scanner_token');
};

export const linkScanner = async (token: string) => {
  const response = await fetchWithTimeout(`${API_BASE}/scanner/link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  const data = await handleResponse(response);
  await saveToken(token);
  return data;
};

export const getMe = async () => {
  const token = await getToken();
  if (!token) throw new Error('Scanner not linked. Please scan the QR code to connect.');

  const response = await fetchWithTimeout(`${API_BASE}/scanner/me?token=${token}`);
  return handleResponse(response);
};

export const pushScan = async (payload: any) => {
  const token = await getToken();
  if (!token) throw new Error('Scanner not linked');

  const response = await fetchWithTimeout(`${API_BASE}/scanner/push-scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, payload }),
  });
  return handleResponse(response);
};

export const cancelScan = async () => {
  const token = await getToken();
  if (!token) return; // Silent no-op — nothing to cancel

  try {
    const response = await fetchWithTimeout(`${API_BASE}/scanner/cancel-scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    return handleResponse(response);
  } catch {
    // Best-effort — don't block the caller if cancellation fails
  }
};

export const createEventSource = async () => {
  const token = await getToken();
  if (!token) throw new Error('Scanner not linked');
  return new EventSource(`${API_BASE}/scanner/app-events?token=${token}`);
};

// ─── Attendance ───

export const getAttendanceStatus = async () => {
  const token = await getToken();
  if (!token) throw new Error('Scanner not linked');
  const response = await fetchWithTimeout(`${API_BASE}/scanner/attendance-status?token=${token}`);
  return handleResponse(response);
};

export const clockIn = async (latitude?: number, longitude?: number, note?: string) => {
  const token = await getToken();
  if (!token) throw new Error('Scanner not linked');

  const body: any = { token };
  if (latitude != null) body.latitude = latitude;
  if (longitude != null) body.longitude = longitude;
  if (note) body.note = note;

  const response = await fetchWithTimeout(`${API_BASE}/scanner/clock-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return handleResponse(response);
};

export const clockOut = async (latitude?: number, longitude?: number, note?: string) => {
  const token = await getToken();
  if (!token) throw new Error('Scanner not linked');

  const body: any = { token };
  if (latitude != null) body.latitude = latitude;
  if (longitude != null) body.longitude = longitude;
  if (note) body.note = note;

  const response = await fetchWithTimeout(`${API_BASE}/scanner/clock-out`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return handleResponse(response);
};
