/* CashClaw — WebSocket client with auto-reconnect, backoff, and message replay */

/** Browser-safe logger interface with fallback */
const logger = {
  error: (...args) => { if (typeof console !== 'undefined' && console.error) console.error(...args); },
  warn: (...args) => { if (typeof console !== 'undefined' && console.warn) console.warn(...args); },
  info: (...args) => { if (typeof console !== 'undefined' && console.info) console.info(...args); },
};

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
const lastSeqs = {};
const seenSeqs = new Set();
const SEEN_SEQ_MAX = 5000;
const MAX_RECONNECT_DELAY = 30000;
const STALE_TIMEOUT = 60000;
const WS_URL_KEY = 'cc-ws-url';

function updateDots() {
  if (typeof document === 'undefined') return;
  const dots = document.querySelectorAll('.cc-ws-dot');
  dots.forEach((dot) => {
    Object.values(STATUS_CLASSES).forEach((cls) => dot.classList.remove(cls));
    dot.classList.add(STATUS_CLASSES[status] || STATUS_CLASSES.stale);
  });
}

function resetStaleTimer() {
  clearTimeout(staleTimer);
  staleTimer = setTimeout(() => {
    status = 'stale';
    updateDots();
  }, STALE_TIMEOUT);
}

function emit(event, data) {
  const list = handlers[event];
  if (!list) return;
  for (const fn of list) {
    try { fn(data); } catch (e) { logger.error(`[ws] handler error for "${event}"`, e); }
  }
}

function trackSeq(data) {
  if (data && data.channel && typeof data.seq === 'number') {
    lastSeqs[data.channel] = data.seq;
    seenSeqs.add(`${data.channel}:${data.seq}`);
    if (seenSeqs.size > SEEN_SEQ_MAX) {
      const iter = seenSeqs.values();
      for (let i = 0; i < 1000; i++) seenSeqs.delete(iter.next().value);
    }
  }
}

function isDuplicate(data) {
  if (data && data.channel && typeof data.seq === 'number') {
    return seenSeqs.has(`${data.channel}:${data.seq}`);
  }
  return false;
}

function sendReconnect() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'reconnect', lastSeqs: { ...lastSeqs } }));
  }
}

export function connect(url) {
  if (ws) {
    ws.close();
    ws = null;
  }
  if (url) {
    try { sessionStorage.setItem(WS_URL_KEY, url); } catch { /* ignore */ }
  } else {
    try { url = sessionStorage.getItem(WS_URL_KEY) || url; } catch { /* ignore */ }
  }

  status = 'connecting';
  updateDots();

  try {
    ws = new WebSocket(url);
  } catch {
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
    if (Object.keys(lastSeqs).length > 0) sendReconnect();
  };

  ws.onmessage = (event) => {
    resetStaleTimer();
    try {
      const data = JSON.parse(event.data);
      const type = data.type;
      if (type === 'replay_start' || type === 'replay_end' || type === 'snapshot_required') {
        emit(type, data);
        emit('message', data);
        return;
      }
      if (isDuplicate(data)) return;
      trackSeq(data);
      if (type && type !== 'message') emit(type, data);
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

function scheduleReconnect(url) {
  clearTimeout(reconnectTimer);
  const base = Math.min(1000 * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY);
  const jitter = base * 0.2 * Math.random();
  reconnectAttempts++;
  reconnectTimer = setTimeout(() => connect(url), base + jitter);
}

export function on(event, handler) {
  if (!handlers[event]) handlers[event] = [];
  handlers[event].push(handler);
}

export function getStatus() {
  return status;
}

export function getLastSeq(channel) {
  return lastSeqs[channel] || 0;
}

export function forceReconnect() {
  Object.keys(lastSeqs).forEach((ch) => { delete lastSeqs[ch]; });
  seenSeqs.clear();
  const url = (() => { try { return sessionStorage.getItem(WS_URL_KEY); } catch { return null; } })();
  if (url) connect(url);
}
