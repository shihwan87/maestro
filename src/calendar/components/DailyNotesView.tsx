// Purpose: single-entry-per-day diary note for the selected date — an
// Events box (pre-filled from that day's schedule on first open only) and a
// freeform Thoughts box.
// Architecture note: two PIN gates, both reusing PinConfirmModal. This
// component only mounts/unmounts when the NOTES tab itself is entered/left
// (CalendarApp doesn't remount it on date changes), so both entryUnlocked
// and editUnlocked persist across ‹ › date navigation within one tab visit —
// re-prompting on every date change was flagged as too cumbersome. Leaving
// the tab and coming back always re-prompts (same precedent as
// TrustedDeviceManager re-verifying on every open).

import { useEffect, useState } from 'react';
import { PinConfirmModal } from '../../components/PinConfirmModal';
import { COLORS } from '../../styles/theme';
import { dayRange, fetchEventInstances, fetchDailyNote, saveDailyNote, deleteDailyNote, buildDailyEventsTemplate } from '../lib/api';
import type { SchedDailyNote } from '../lib/types';

interface DailyNotesViewProps {
  date: string; // 'YYYY-MM-DD'
  onCancelEntry?: () => void; // lets the entry PIN prompt back out (e.g. misclick) to another tab
  onUnlocked?: () => void; // entry PIN cleared — lets the date picker show which days are written
  onNotesChanged?: () => void; // a note was saved or deleted — the picker's marks are now stale
}

// 15 lines at fontSize 14 / lineHeight 1.5 (=21px/line) + 20px vertical padding.
// Fixed (not min) height, with overflow scroll, so the box footprint stays
// the same whether the day's content is short or long — was the "few lines
// on desktop" complaint: the read-only view previously shrank to content.
const BOX_HEIGHT = 335;

export function DailyNotesView({ date, onCancelEntry, onUnlocked, onNotesChanged }: DailyNotesViewProps) {
  const [entryUnlocked, setEntryUnlocked] = useState(false);
  const [editUnlocked, setEditUnlocked] = useState(false);
  const [pendingAction, setPendingAction] = useState<'edit' | 'delete' | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [existingNote, setExistingNote] = useState<SchedDailyNote | null>(null);
  const [editing, setEditing] = useState(false);
  const [eventsText, setEventsText] = useState('');
  const [thoughtsText, setThoughtsText] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    if (!entryUnlocked) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setEditing(false);
    setConfirmingDelete(false);
    setPendingAction(null);
    Promise.all([fetchDailyNote(date), fetchEventInstances(dayRange(date))])
      .then(([note, instances]) => {
        if (cancelled) return;
        setExistingNote(note);
        if (note) {
          setEventsText(note.events_text ?? '');
          setThoughtsText(note.thoughts_text ?? '');
        } else {
          setEventsText(buildDailyEventsTemplate(instances));
          setThoughtsText('');
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load daily note');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entryUnlocked, date]);

  if (!entryUnlocked) {
    return (
      <PinConfirmModal
        title="Daily Notes"
        subtitle="Enter PIN to view this day's notes"
        onVerified={() => {
          setEntryUnlocked(true);
          onUnlocked?.();
        }}
        onCancel={onCancelEntry}
      />
    );
  }

  function requestGuardedAction(action: 'edit' | 'delete') {
    if (editUnlocked) {
      if (action === 'edit') setEditing(true);
      else setConfirmingDelete(true);
      return;
    }
    setPendingAction(action);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const saved = await saveDailyNote(date, { eventsText, thoughtsText });
      setExistingNote(saved);
      setEditing(false);
      onNotesChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save note');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setSaving(true);
    setError(null);
    try {
      await deleteDailyNote(date);
      setExistingNote(null);
      setEventsText('');
      setThoughtsText('');
      setConfirmingDelete(false);
      onNotesChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete note');
    } finally {
      setSaving(false);
    }
  }

  if (pendingAction) {
    return (
      <PinConfirmModal
        title="Confirm PIN"
        subtitle={pendingAction === 'edit' ? 'Confirm PIN to edit this note' : 'Confirm PIN to delete this note'}
        onVerified={() => {
          setEditUnlocked(true);
          if (pendingAction === 'edit') setEditing(true);
          else setConfirmingDelete(true);
          setPendingAction(null);
        }}
        onCancel={() => setPendingAction(null)}
      />
    );
  }

  if (loading) return <p style={{ color: COLORS.muted, padding: 16 }}>Loading…</p>;

  return (
    <div style={{ padding: 16 }}>
      {error && <p style={{ color: COLORS.danger, fontSize: 13, marginBottom: 12 }}>{error}</p>}

      <div style={ACTION_BAR_STYLE}>
        {editing ? (
          <>
            <button onClick={handleSave} disabled={saving} style={primaryBtnStyle}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => {
                setEditing(false);
                if (existingNote) {
                  setEventsText(existingNote.events_text ?? '');
                  setThoughtsText(existingNote.thoughts_text ?? '');
                }
              }}
              style={secondaryBtnStyle}
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button onClick={() => requestGuardedAction('edit')} style={secondaryBtnStyle}>
              Edit
            </button>
            {existingNote && !confirmingDelete && (
              <button onClick={() => requestGuardedAction('delete')} style={secondaryBtnStyle}>
                Delete
              </button>
            )}
            {confirmingDelete && (
              <>
                <button onClick={handleDelete} disabled={saving} style={{ ...secondaryBtnStyle, color: COLORS.danger, borderColor: COLORS.danger }}>
                  {saving ? 'Deleting…' : 'Confirm delete'}
                </button>
                <button onClick={() => setConfirmingDelete(false)} style={secondaryBtnStyle}>
                  Cancel
                </button>
              </>
            )}
          </>
        )}
      </div>

      <NoteBox
        label="Events"
        value={eventsText}
        editable={editing}
        onChange={setEventsText}
      />
      <NoteBox
        label="Thoughts"
        value={thoughtsText}
        editable={editing}
        onChange={setThoughtsText}
      />
    </div>
  );
}

function NoteBox({
  label,
  value,
  editable,
  onChange,
}: {
  label: string;
  value: string;
  editable: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ color: COLORS.muted, fontSize: 12, fontWeight: 600, marginBottom: 6, letterSpacing: 0.5 }}>
        {label.toUpperCase()}
      </div>
      {editable ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={15}
          style={{
            width: '100%',
            height: BOX_HEIGHT,
            padding: 10,
            fontSize: 14,
            lineHeight: 1.5,
            fontFamily: 'inherit',
            background: COLORS.bg,
            color: COLORS.text,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 8,
            boxSizing: 'border-box',
            resize: 'vertical',
          }}
        />
      ) : (
        <div
          style={{
            whiteSpace: 'pre-wrap',
            padding: 10,
            height: BOX_HEIGHT,
            overflowY: 'auto',
            fontSize: 14,
            lineHeight: 1.5,
            background: COLORS.card,
            color: value ? COLORS.text : COLORS.muted,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 8,
            boxSizing: 'border-box',
          }}
        >
          {value || 'Nothing yet.'}
        </div>
      )}
    </div>
  );
}

// The Edit/Save row sits above both boxes and sticks just under the fixed
// bars (48px top tab + ~43px calendar sub-tab) so it stays reachable while
// scrolling a long day's notes instead of sitting off-screen at the bottom.
const ACTION_BAR_STYLE: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  position: 'sticky',
  top: 'calc(92px + env(safe-area-inset-top, 0px))',
  zIndex: 40,
  background: COLORS.bg,
  padding: '8px 0',
  marginBottom: 8,
};

const primaryBtnStyle: React.CSSProperties = {
  padding: '8px 16px',
  background: COLORS.primary,
  color: '#fff',
  border: 0,
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

const secondaryBtnStyle: React.CSSProperties = {
  padding: '8px 16px',
  background: 'transparent',
  color: COLORS.text,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 8,
  fontSize: 13,
  cursor: 'pointer',
};
