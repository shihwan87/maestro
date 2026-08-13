// Purpose: single-entry-per-day diary note for the selected date — an
// Events box (pre-filled from that day's schedule on first open only) and a
// freeform Thoughts box.
// Architecture note: two PIN gates, both reusing PinConfirmModal. Entry gate
// blocks the whole view on mount (CalendarApp remounts this component fresh
// each time NOTES is (re)selected via its key, so it always re-prompts —
// same precedent as TrustedDeviceManager re-verifying on every open). A
// second "edit unlock" gate fires the first time Edit or Delete is clicked
// and, once passed, stays open for the rest of this mount so Save doesn't
// re-prompt on every keystroke.

import { useEffect, useState } from 'react';
import { PinConfirmModal } from '../../components/PinConfirmModal';
import { COLORS } from '../../styles/theme';
import { dayRange, fetchEventInstances, fetchDailyNote, saveDailyNote, deleteDailyNote, buildDailyEventsTemplate } from '../lib/api';
import type { SchedDailyNote } from '../lib/types';

interface DailyNotesViewProps {
  date: string; // 'YYYY-MM-DD'
}

export function DailyNotesView({ date }: DailyNotesViewProps) {
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
        onVerified={() => setEntryUnlocked(true)}
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

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
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
          rows={label === 'Thoughts' ? 10 : 6}
          style={{
            width: '100%',
            padding: 10,
            fontSize: 14,
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
            minHeight: 40,
            fontSize: 14,
            background: COLORS.card,
            color: value ? COLORS.text : COLORS.muted,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 8,
          }}
        >
          {value || 'Nothing yet.'}
        </div>
      )}
    </div>
  );
}

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
