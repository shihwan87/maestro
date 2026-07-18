// Purpose: "Sync now" button, lives in the app header.
// Inputs: SyncButtonProps (interface_contract.md module 27).
// Outputs: calls onSyncComplete with the latest SyncResult[].
// Architecture note: surfaces per-calendar errors inline (SyncResult.error)
// rather than a single pass/fail state, so one calendar failing doesn't hide
// another's success.

import { useState } from 'react';
import { triggerSync } from '../lib/api';
import type { SyncResult } from '../lib/types';
import { COLORS } from '../../styles/theme';

interface SyncButtonProps {
  onSyncComplete?: (results: SyncResult[]) => void;
}

export function SyncButton({ onSyncComplete }: SyncButtonProps) {
  const [syncing, setSyncing] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  async function handleClick() {
    setSyncing(true);
    setErrors([]);
    try {
      const results = await triggerSync();
      const failed = results.filter((r) => r.error).map((r) => `${r.calendarId}: ${r.error}`);
      setErrors(failed);
      onSyncComplete?.(results);
    } catch (err) {
      setErrors([err instanceof Error ? err.message : 'Sync failed']);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={syncing}
        style={{
          padding: '6px 12px',
          background: 'none',
          border: `1px solid ${COLORS.border}`,
          borderRadius: 4,
          color: COLORS.text,
          cursor: syncing ? 'default' : 'pointer',
        }}
      >
        {syncing ? 'Syncing…' : 'Sync now'}
      </button>
      {errors.map((msg) => (
        <p key={msg} style={{ color: COLORS.danger, fontSize: 12, margin: '4px 0 0' }}>
          {msg}
        </p>
      ))}
    </div>
  );
}
