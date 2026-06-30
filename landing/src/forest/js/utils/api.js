// ── CashClaw API Utility (forest utils) ──
// Fetch wrapper with consistent error handling

/**
 * Fetch JSON from a URL with POST body.
 * Returns { ok: true, data } or { ok: false, error: string }.
 */
export async function postJSON(url, body = {}) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: data.error || data.reason || `HTTP ${res.status}` };
    }
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: 'Network error. Please try again.' };
  }
}

/**
 * Fetch JSON from a URL with GET.
 * Returns { ok: true, data } or { ok: false, error: string }.
 */
export async function getJSON(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const data = await res.json();
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: 'Network error. Please try again.' };
  }
}
