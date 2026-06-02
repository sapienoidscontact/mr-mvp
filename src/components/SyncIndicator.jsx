import { useState, useEffect, useCallback } from 'react';
import { syncNow } from '../lib/syncEngine.js';

export default function SyncIndicator() {
  const [status, setStatus] = useState({ pending: 0, syncing: false, error: null });

  useEffect(() => {
    function handler(e) { setStatus(e.detail); }
    window.addEventListener('syncStatusChange', handler);
    return () => window.removeEventListener('syncStatusChange', handler);
  }, []);

  const handleRetry = useCallback(() => syncNow(), []);

  if (status.error) {
    return (
      <button
        onClick={handleRetry}
        className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 text-sm font-medium shadow"
        aria-label="Sync failed — tap to retry"
      >
        <span>⚠</span>
        <span>Sync failed · Retry</span>
      </button>
    );
  }

  if (status.syncing || status.pending > 0) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 text-sm font-medium shadow">
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        <span>{status.pending > 0 ? `↻ ${status.pending} pending` : 'Syncing…'}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 text-sm font-medium shadow">
      <span>✓</span>
      <span>All synced</span>
    </div>
  );
}
