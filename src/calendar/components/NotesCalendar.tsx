// Purpose: month-grid date picker for the NOTES tab that marks which days
// already have a saved diary entry, replacing the plain native date input.
// Success criteria: opening it shows the month containing the selected date,
// days with a note render as a filled chip, today gets a ring, future days
// are disabled, and tapping a day selects it and closes the popover.
// Architecture note: every date here is built from local Y/M/D parts, never
// from Date.toISOString(). note_date is a plain date column, so routing
// through UTC would shift every cell by a day in KST. `refreshKey` is bumped
// by DailyNotesView after a save/delete so the marks stay truthful without
// this component subscribing to anything.

import { useEffect, useMemo, useRef, useState } from 'react';
import { COLORS } from '../../styles/theme';
import { fetchDailyNoteDates } from '../lib/api';

const KO_WEEKDAY_SHORT = ['일', '월', '화', '수', '목', '금', '토'];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toDateStr(y: number, m: number, d: number): string {
  return `${y}-${pad2(m + 1)}-${pad2(d)}`;
}

function todayDateStr(): string {
  const d = new Date();
  return toDateStr(d.getFullYear(), d.getMonth(), d.getDate());
}

interface MonthCell {
  date: string;
  day: number;
  inMonth: boolean;
}

// Six full weeks starting from the Sunday on/before the 1st, so the grid
// height never jumps between months.
function buildMonthGrid(year: number, month: number): MonthCell[] {
  const first = new Date(year, month, 1);
  const gridStart = new Date(year, month, 1 - first.getDay());
  const cells: MonthCell[] = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    cells.push({
      date: toDateStr(d.getFullYear(), d.getMonth(), d.getDate()),
      day: d.getDate(),
      inMonth: d.getMonth() === month,
    });
  }
  return cells;
}

interface NotesCalendarProps {
  date: string; // currently selected 'YYYY-MM-DD'
  refreshKey: number; // bump to refetch the marks after a save/delete
  onSelectDate: (date: string) => void;
  onClose: () => void;
}

export function NotesCalendar({ date, refreshKey, onSelectDate, onClose }: NotesCalendarProps) {
  const selected = new Date(`${date}T00:00:00`);
  const [year, setYear] = useState(selected.getFullYear());
  const [month, setMonth] = useState(selected.getMonth()); // 0-based
  const [noteDates, setNoteDates] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const cells = useMemo(() => buildMonthGrid(year, month), [year, month]);
  const today = todayDateStr();
  const rangeStart = cells[0].date;
  const rangeEnd = cells[cells.length - 1].date;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchDailyNoteDates(rangeStart, rangeEnd)
      .then((dates) => {
        if (!cancelled) setNoteDates(new Set(dates));
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load note days');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rangeStart, rangeEnd, refreshKey]);

  // Click-away and Escape both dismiss — the popover overlaps the day's note
  // boxes, so there has to be a way out that isn't picking a date.
  useEffect(() => {
    function onPointerDown(e: MouseEvent | TouchEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  function shiftMonth(delta: number) {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  }

  // Stepping past the month containing today has nothing to show — notes
  // only exist for today and earlier (same rule as the ‹ › day nav).
  const todayDate = new Date(`${today}T00:00:00`);
  const forwardBlocked =
    year > todayDate.getFullYear() || (year === todayDate.getFullYear() && month >= todayDate.getMonth());

  return (
    <div ref={panelRef} style={S.panel}>
      <div style={S.head}>
        <button onClick={() => shiftMonth(-1)} style={S.navBtn} aria-label="Previous month">
          ‹
        </button>
        <div style={S.monthLabel}>
          {year}. {month + 1}
        </div>
        <button
          onClick={() => shiftMonth(1)}
          disabled={forwardBlocked}
          style={{ ...S.navBtn, opacity: forwardBlocked ? 0.35 : 1, cursor: forwardBlocked ? 'default' : 'pointer' }}
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      <div style={S.weekRow}>
        {KO_WEEKDAY_SHORT.map((w) => (
          <div key={w} style={S.weekCell}>
            {w}
          </div>
        ))}
      </div>

      <div style={S.grid}>
        {cells.map((cell) => {
          const hasNote = noteDates.has(cell.date);
          const isSelected = cell.date === date;
          const isToday = cell.date === today;
          const disabled = cell.date > today;
          return (
            <button
              key={cell.date}
              disabled={disabled}
              onClick={() => {
                onSelectDate(cell.date);
                onClose();
              }}
              style={{
                ...S.dayBtn,
                background: hasNote ? COLORS.primary : 'transparent',
                color: hasNote ? '#fff' : cell.inMonth ? COLORS.text : COLORS.muted,
                fontWeight: hasNote ? 700 : 400,
                opacity: disabled ? 0.25 : cell.inMonth ? 1 : 0.5,
                cursor: disabled ? 'default' : 'pointer',
                border: isSelected
                  ? `2px solid ${COLORS.ok}`
                  : isToday
                    ? `1px solid ${COLORS.muted}`
                    : '1px solid transparent',
              }}
            >
              {cell.day}
            </button>
          );
        })}
      </div>

      <div style={S.legend}>
        {loading && <span>Loading…</span>}
        {error && <span style={{ color: COLORS.danger }}>{error}</span>}
        {!loading && !error && (
          <>
            <span style={S.legendChip} />
            <span>written</span>
            <span style={{ ...S.legendChip, background: 'transparent', border: `2px solid ${COLORS.ok}` }} />
            <span>selected</span>
          </>
        )}
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  panel: {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    right: 0,
    zIndex: 70,
    width: 288,
    padding: 10,
    background: COLORS.card,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 12,
    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
  },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  monthLabel: { color: COLORS.text, fontSize: 14, fontWeight: 700 },
  navBtn: {
    background: 'none',
    border: `1px solid ${COLORS.border}`,
    borderRadius: 6,
    color: COLORS.text,
    cursor: 'pointer',
    fontSize: 14,
    padding: '2px 10px',
  },
  weekRow: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 2 },
  weekCell: { textAlign: 'center', color: COLORS.muted, fontSize: 11, fontWeight: 600, padding: '2px 0' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 },
  dayBtn: {
    height: 34,
    borderRadius: 8,
    fontSize: 13,
    fontFamily: 'inherit',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
  },
  legend: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
    color: COLORS.muted,
    fontSize: 11,
  },
  legendChip: {
    display: 'inline-block',
    width: 12,
    height: 12,
    borderRadius: 4,
    background: COLORS.primary,
  },
};
