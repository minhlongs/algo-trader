/* CashClaw — WebSocket client with auto-reconnect, exponential backoff, and message replay
 * Updates all .cc-ws-dot elements automatically based on connection state.
 * Supports sequence-based message replay on reconnect.
 */

import { logger } from '../../shared/utils/logger';

const STATUS_CLASSES = {
  connected: 'cc-ws-dot--live',
  connecting: 'cc-ws-dot--connecting',
  error: 'cc-ws-dot--error',
  stale: 'cc-ws-dot--stale',
};

let ws = null;
let status = 'stale';
let reconnectAttempts = 0;
let reconnectTimer = null;
let staleTimer = null;
const handlers = {};

/** Per-channel last received sequence number */
const lastSeqs = {};

/** Dedup set: "channel:seq" -> true, prevents processing same message twice */
const seenSeqs = new Set();
const SEEN_SEQ_MAX = 5000;

const MAX_RECONNECT_DELAY = 30000;
const STALE_TIMEOUT = 60000;
const WS_URL_KEY = 'cc-ws-url';

/** Update all .cc-ws-dot elements to reflect current status */
function updateDots() {
  const dots = document.querySelectorAll('.cc-ws-dot');
  dots.forEach((dot) => {
    Object.values(STATUS_CLASSES).forEach((cls) => dot.classList.remove(cls));
    dot.classList.add(STATUS_CLASSES[status] || STATUS_CLASSES.stale);
  });
}

/** Reset the stale timer — called on every message received */
function resetStaleTimer() {
  clearTimeout(staleTimer);
  staleTimer = setTimeout(() => {
    status = 'stale';
    updateDots();
  }, STALE_TIMEOUT);
}

/** Emit event to registered handlers */
function emit(event, data) {
  const list = handlers[event];
  if (!list) return;
  for (const fn of list) {
    try { fn(data); } catch (e) { logger.error(`[ws] handler error for "${event}"`, e); }
  }
}

/** Track lastSeq for a channel from an incoming message */
function trackSeq(data) {
  if (data && data.channel && typeof data.seq === 'number') {
    lastSeqs[data.channel] = data.seq;
    // Evict old dedup entries to prevent memory leak
    const key = `${data.channel}:${data.seq}`;
    seenSeqs.add(key);
    if (seenSeqs.size > SEEN_SEQ_MAX) {
      const iter = seenSeqs.values();
      for (let i = 0; i < 1000; i++) {
        seenSeqs.delete(iter.next().value);
      }
    }
  }
}

/** Check if a message was already seen (dedup) */
function isDuplicate(data) {
  if (data && data.channel && typeof data.seq === 'number') {
    const key = `${data.channel}:${data.seq}`;
    if (seenSeqs.has(key)) return true;
  }
  return false;
}

/** Send reconnect message with lastSeqs to server */
function sendReconnect() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'reconnect',
      lastSeqs: { ...lastSeqs },
    }));
  }
}

/**
 * Connect to a WebSocket URL.
 * Automatically reconnects on disconnect with exponential backoff.
 * On reconnect, sends lastSeqs for message replay.
 */
export function connect(url) {
  if (ws) {
    ws.close();
    ws = null;
  }

  // Persist URL for reconnect
  if (url) {
    try { sessionStorage.setItem(WS_URL_KEY, url); } catch { /* ignore */ }
  } else {
    try { url = sessionStorage.getItem(WS_URL_KEY) || url; } catch { /* ignore */ }
  }

  status = 'connecting';
  updateDots();

  try {
    ws = new WebSocket(url);
  } catch (e) {
    status = 'error';
    updateDots();
    scheduleReconnect(url);
    return;
  }

  ws.onopen = () => {
    status = 'connected';
    reconnectAttempts = 0;
    updateDots();
    resetStaleTimer();
    emit('open', null);

    // Send replay request if we have previous sequence numbers
    if (Object.keys(lastSeqs).length > 0) {
      sendReconnect();
    }
  };

  ws.onmessage = (event) => {
    resetStaleTimer();
    try {
      const data = JSON.parse(event.data);
      const type = data.type || 'message';

      // Handle replay protocol messages
      if (type === 'replay_start' || type === 'replay_end' || type === 'snapshot_required') {
        emit(type, data);
        emit('message', data);
        return;
      }

      // Deduplicate: skip already-seen messages
      if (isDuplicate(data)) return;

      // Track sequence number
      trackSeq(data);

      emit(type, data);
      emit('message', data);
    } catch {
      emit('message', event.data);
    }
  };

  ws.onerror = () => {
    status = 'error';
    updateDots();
  };

  ws.onclose = () => {
    status = 'error';
    updateDots();
    clearTimeout(staleTimer);
    emit('close', null);
    scheduleReconnect(url);
  };
}

/** Schedule a reconnect with exponential backoff + jitter */
function scheduleReconnect(url) {
  clearTimeout(reconnectTimer);
  const base = Math.min(1000 * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY);
  const jitter = base * 0.2 * Math.random();
  const delay = base + jitter;
  reconnectAttempts++;
  reconnectTimer = setTimeout(() => connect(url), delay);
}

/**
 * Register a handler for an event type.
 * Built-in events: 'open', 'close', 'message', 'replay_start', 'replay_end', 'snapshot_required'
 * Custom events: matched by parsed JSON `type` field
 */
export function on(event, handler) {
  if (!handlers[event]) handlers[event] = [];
  handlers[event].push(handler);
}

/** Get current connection status */
export function getStatus() {
  return status;
}

/** Get last received sequence number for a channel */
export function getLastSeq(channel) {
  return lastSeqs[channel] || 0;
}

/** Force a full reconnect (clears lastSeqs, triggers snapshot_required on server) */
export function forceReconnect() {
  Object.keys(lastSeqs).forEach((ch) => { delete lastSeqs[ch]; });
  seenSeqs.clear();
  const url = (() => { try { return sessionStorage.getItem(WS_URL_KEY); } catch { return null; } })();
  if (url) connect(url);
}
