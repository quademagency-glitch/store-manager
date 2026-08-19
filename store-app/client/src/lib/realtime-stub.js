/**
 * Stand-in for @supabase/realtime-js, swapped in by a Vite alias.
 *
 * WHY
 * supabase-js ships as one box: createClient() constructs a RealtimeClient
 * whether or not you ever open a channel. This app has never opened one —
 * no .channel(), no postgres_changes, nothing — but every visitor was still
 * downloading and parsing realtime-js plus its phoenix dependency, about
 * 52KB of the entry chunk, to run a websocket client that never connects.
 * On /signup, where someone is typing a business name into a form, that is
 * pure dead weight on the critical path.
 *
 * WHAT SUPABASE ACTUALLY CALLS
 * The coupling is small and it is all on `this.realtime`:
 *   setAuth()            - on construction and on EVERY auth state change
 *   channel()            - only if the app opens one
 *   getChannels()
 *   removeChannel()
 *   removeAllChannels()
 * setAuth is the load-bearing one. It is called every time the token
 * refreshes, so a stub that omits it breaks sign-in, not realtime.
 *
 * HOW THIS STAYS SAFE
 * scripts/check-realtime-stub.mjs reads the installed supabase-js bundle,
 * finds every `this.realtime.<method>` it calls, and fails the build if this
 * file does not implement one. So a Supabase upgrade that starts calling
 * something new is a red build, not a mystery runtime error in production.
 *
 * IF YOU EVER WANT REALTIME
 * Delete the alias in vite.config.js and this file. channel() throws rather
 * than returning a dead object precisely so that "I added a subscription and
 * nothing happens" cannot occur — you get told immediately.
 */

const DISABLED =
  'Supabase realtime is disabled in this build. Nothing in the app subscribes ' +
  'to a channel, so realtime-js is aliased to a stub to keep it out of the ' +
  'entry chunk. To use realtime, remove the @supabase/realtime-js alias in ' +
  'vite.config.js (see src/lib/realtime-stub.js).';

export class RealtimeClient {
  constructor(url, options) {
    this.url = url;
    this.options = options;
    this.channels = [];
    this.accessToken = null;
  }

  /* Called by SupabaseClient on construction and on every token change.
     Must exist and must not throw, or authentication breaks. */
  setAuth(token = null) {
    this.accessToken = token;
  }

  channel() {
    throw new Error(DISABLED);
  }

  getChannels() {
    return [];
  }

  /* Resolve rather than throw: these are cleanup paths, and supabase-js may
     call them while tearing down a session. Throwing there would turn a
     sign-out into an unhandled rejection. */
  removeChannel() {
    return Promise.resolve('ok');
  }

  removeAllChannels() {
    return Promise.resolve([]);
  }

  connect() {}
  disconnect() {}
  isConnected() {
    return false;
  }
}

/* supabase-js does `export * from "@supabase/realtime-js"`, so these names
   have to exist for the re-export to resolve. Nothing imports them here, so
   they tree-shake out; they are present only to keep the module shape valid. */
export class RealtimeChannel {
  constructor() {
    throw new Error(DISABLED);
  }
}

export class RealtimePresence {
  constructor() {
    throw new Error(DISABLED);
  }
}

export const WebSocketFactory = undefined;

export const REALTIME_LISTEN_TYPES = {
  BROADCAST: 'broadcast',
  PRESENCE: 'presence',
  POSTGRES_CHANGES: 'postgres_changes',
  SYSTEM: 'system',
};

export const REALTIME_POSTGRES_CHANGES_LISTEN_EVENT = {
  ALL: '*',
  INSERT: 'INSERT',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
};

export const REALTIME_PRESENCE_LISTEN_EVENTS = { SYNC: 'sync', JOIN: 'join', LEAVE: 'leave' };

export const REALTIME_SUBSCRIBE_STATES = {
  SUBSCRIBED: 'SUBSCRIBED',
  TIMED_OUT: 'TIMED_OUT',
  CLOSED: 'CLOSED',
  CHANNEL_ERROR: 'CHANNEL_ERROR',
};

export const REALTIME_CHANNEL_STATES = {
  closed: 'closed',
  errored: 'errored',
  joined: 'joined',
  joining: 'joining',
  leaving: 'leaving',
};

export default { RealtimeClient, RealtimeChannel, RealtimePresence };
