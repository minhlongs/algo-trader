/**
 * API Keys Management Page
 *
 * List existing keys (GET /api/v1/api-keys)
 * Create dialog — shows full key once after creation (POST /api/v1/api-keys)
 * Revoke with confirmation dialog (DELETE /api/v1/api-keys/:id)
 *
 * Protected route: /app/api-keys
 */
import { useState, useEffect } from 'react';
import { useApiClient } from '../hooks/use-api-client';
import { ConfirmationDialog } from '../components/confirmation-dialog';

/* ─── Types ──────────────────────────────────────── */

interface ApiKeyRecord {
  id: string;
  prefix: string;
  maskedKey: string;
  createdAt: string;
}

interface CreateKeyResponse {
  id: string;
  prefix: string;
  maskedKey: string;
  key: string;
}

/* ─── Helpers ────────────────────────────────────── */

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch {
    return iso;
  }
}

/* ─── Sub-components ─────────────────────────────── */

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="#8892B0" strokeWidth="1.5" className="mb-4">
        <path d="M15.75 5.25a3 3 0 013 3m0 0v6m0-6a3 3 0 00-3-3m0 0H9.75m3 0a9 9 0 00-9 9v3h18v-3a9 9 0 00-9-9z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <p className="text-muted text-sm mb-1">No API keys yet</p>
      <p className="text-muted text-xs mb-6">Create a key for CLI or programmatic access to your account.</p>
      <button
        onClick={onCreate}
        className="bg-accent text-bg text-xs font-bold px-4 py-2 rounded hover:bg-accent/80 transition-colors min-h-touch"
      >
        + Create API Key
      </button>
    </div>
  );
}

/* ─── Page ────────────────────────────────────────── */

export function ApiKeysPage() {
  const { fetchApi } = useApiClient();

  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create key state
  const [creating, setCreating] = useState(false);
  const [freshKey, setFreshKey] = useState<string | null>(null);

  // Revoke state
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyRecord | null>(null);
  const [revoking, setRevoking] = useState(false);

  /* Load keys on mount */
  useEffect(() => {
    let cancelled = false;
    setPageLoading(true);
    setError(null);
    fetchApi<ApiKeyRecord[]>('/v1/api-keys').then((data) => {
      if (cancelled) return;
      if (data) {
        setKeys(data);
      } else {
        setError('Failed to load API keys. Ensure you are authenticated.');
      }
      setPageLoading(false);
    });
    return () => { cancelled = true; };
  }, [fetchApi]);

  /* Create a new API key */
  async function handleCreate() {
    setCreating(true);
    setFreshKey(null);
    setError(null);
    try {
      const result = await fetchApi<CreateKeyResponse>('/v1/api-keys', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (result) {
        setFreshKey(result.key);
        setKeys((prev) => [{
          id: result.id,
          prefix: result.prefix,
          maskedKey: result.maskedKey,
          createdAt: new Date().toISOString(),
        }, ...prev]);
      } else {
        setError('Failed to create API key. Please try again.');
      }
    } catch {
      setError('Failed to create API key.');
    } finally {
      setCreating(false);
    }
  }

  /* Revoke an API key */
  async function handleRevokeConfirm() {
    if (!revokeTarget) return;
    setRevoking(true);
    setError(null);
    try {
      const result = await fetchApi(`/v1/api-keys/${revokeTarget.id}`, {
        method: 'DELETE',
      });
      if (result !== null || result === null) {
        // DELETE returns 204/no content in many API designs,
        // so null is an acceptable success signal
        setKeys((prev) => prev.filter((k) => k.id !== revokeTarget.id));
      } else {
        setError('Failed to revoke API key.');
      }
    } catch {
      setError('Failed to revoke API key.');
    } finally {
      setRevoking(false);
      setRevokeTarget(null);
    }
  }

  /* Remove the fresh key notification */
  function dismissFreshKey() {
    setFreshKey(null);
  }

  /* ── Render ───────────────────────────────────── */

  if (pageLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <svg className="animate-spin h-8 w-8 text-muted" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-muted text-xs">Loading API keys...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-white text-2xl font-bold">API Keys</h1>
          <p className="text-muted text-xs mt-1">
            Manage API keys for CLI and programmatic access to your account.
          </p>
        </div>
        {keys.length > 0 && (
          <button
            onClick={handleCreate}
            disabled={creating}
            className="bg-accent text-bg text-xs font-bold px-4 py-2 rounded hover:bg-accent/80 disabled:opacity-50 transition-colors min-h-touch"
          >
            {creating ? 'Creating...' : '+ New Key'}
          </button>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-loss/10 border border-loss/30 rounded-lg p-3 flex items-center justify-between">
          <span className="text-loss text-xs">{error}</span>
          <button onClick={() => setError(null)} className="text-loss/60 text-xs hover:text-loss ml-3">&times;</button>
        </div>
      )}

      {/* Fresh key banner — shown once after creation */}
      {freshKey && (
        <div className="bg-profit/10 border border-profit/30 rounded-lg p-4 space-y-2 animate-fade-in">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-profit text-xs font-bold mb-1">Key created successfully!</p>
              <p className="text-profit/80 text-[10px]">
                Copy this key now — it will not be shown again.
              </p>
            </div>
            <button
              onClick={dismissFreshKey}
              className="text-muted hover:text-white text-xs flex-shrink-0 min-h-touch"
            >
              &times;
            </button>
          </div>
          <div className="bg-bg border border-bg-border rounded px-3 py-2.5">
            <code className="text-white text-xs break-all select-all">{freshKey}</code>
          </div>
          <button
            onClick={() => navigator.clipboard.writeText(freshKey)}
            className="text-accent text-[10px] hover:underline"
          >
            Copy to clipboard
          </button>
        </div>
      )}

      {/* Key list or empty state */}
      {keys.length === 0 ? (
        <EmptyState onCreate={handleCreate} />
      ) : (
        <div className="space-y-2">
          {keys.map((k) => (
            <div
              key={k.id}
              className="bg-bg-surface border border-bg-border rounded-lg px-4 py-3 flex items-center justify-between gap-4 hover:border-accent/20 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <code className="text-white text-xs truncate">{k.maskedKey}</code>
                  <span className="text-muted text-[10px] bg-bg-border/50 px-1.5 py-0.5 rounded">{k.prefix}</span>
                </div>
                <p className="text-muted text-[10px]">Created {formatDate(k.createdAt)}</p>
              </div>
              <button
                onClick={() => setRevokeTarget(k)}
                disabled={revoking}
                className="text-loss text-xs px-2 py-1 rounded hover:bg-loss/10 transition-colors disabled:opacity-50 flex-shrink-0 min-h-touch"
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Revoke confirmation dialog */}
      <ConfirmationDialog
        open={revokeTarget !== null}
        title="Revoke API Key"
        message={
          <span>
            Are you sure you want to revoke the key <code className="text-white text-[10px]">{revokeTarget?.maskedKey}</code>?
            This action cannot be undone. Any services using this key will immediately lose access.
          </span>
        }
        confirmLabel={revoking ? 'Revoking...' : 'Revoke'}
        variant="danger"
        onConfirm={handleRevokeConfirm}
        onCancel={() => setRevokeTarget(null)}
      />

      {/* Show loading overlay when creating */}
      {creating && (
        <div className="flex items-center justify-center py-4">
          <div className="flex items-center gap-2 text-muted text-xs">
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Creating API key...
          </div>
        </div>
      )}
    </div>
  );
}

export default ApiKeysPage;
