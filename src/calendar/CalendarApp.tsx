// Purpose: root component — Supabase Auth gate, Google-connect prompt, and
// the Daily / Weekly dashboard tabs + their shared EventDetail modal
// (view/edit/create, Phase 4).
// Success criteria: user logs in, connects Google, tokens land in
// sched_google_auth; tab bar switches between Daily/Weekly; each view
// renders its synced events and supports create/edit/delete/push/un-push
// through EventDetail.
// Inputs/outputs: none (root component, no props).
// Architecture note: one shared `date` state flows through both tabs —
// Daily uses it directly, Weekly derives weekStart = mondayOfWeek(date).
// Prev/next buttons shift by 1 day (Daily) or 7 days (Weekly). refreshKey
// remounts the current tab body after save/delete so the next fetch picks
// up the change — no shared events store/cache, same rationale as Phase 3a.
// The Phase 5 "Next Week" tab was removed as redundant with Weekly's own
// prev/next nav.

import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, getSession, onAuthStateChange } from './lib/supabase';
import { isGoogleConnected, startGoogleConnect } from './lib/api';
import { DailyView } from './components/DailyView';
import { WeeklyView } from './components/WeeklyView';
import { EventDetail, type EventDetailMode } from './components/EventDetail';
import { SyncButton } from './components/SyncButton';
import type { EventInstance, SchedEvent, SyncResult } from './lib/types';
import { COLORS } from '../styles/theme';

type Tab = 'daily' | 'weekly';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function todayDateStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

const KO_WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

// "'26. 7. 14 (수)" format used in the Daily tab header.
function formatDailyHeader(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  const yy = String(d.getFullYear()).slice(2);
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const wd = KO_WEEKDAY[d.getDay()];
  return `'${yy}. ${m}. ${day} (${wd})`;
}

// ISO 8601 week number. Uses the Monday of the displayed week (weekStart+1)
// so the label matches standard calendar conventions.
function isoWeek(date: string): number {
  const d = new Date(`${date}T00:00:00`);
  const dow = d.getDay() || 7; // Sun=0 → 7 so Thursday anchor works
  d.setDate(d.getDate() + 4 - dow); // move to Thursday of this ISO week
  const jan1 = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + 1) / 7);
}

// Sunday of the week containing `date`. getDay() returns 0=Sun..6=Sat,
// so subtracting getDay() always lands on the preceding (or same) Sunday.
function sundayOfWeek(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() - d.getDay());
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

type GoogleAuthStatus = 'connected' | 'denied' | 'error' | null;

function readGoogleAuthStatusFromUrl(): GoogleAuthStatus {
  const params = new URLSearchParams(window.location.search);
  const value = params.get('google_auth');
  if (value === 'connected' || value === 'denied' || value === 'error') {
    // Clear the query param so a page refresh doesn't re-show the banner.
    window.history.replaceState({}, '', window.location.pathname);
    return value;
  }
  return null;
}

// Password sign-in is the default now (2026-07-07 session fix): the
// original magic-link-only flow required a fresh email every single login,
// and Supabase's built-in/shared email sender has a low daily send limit —
// not meant for regular sign-in traffic, only for occasional confirmation
// emails. Password sign-in sends no email at all, so neither problem
// applies. Magic link stays as a fallback (first-time setup, or if the
// password is forgotten) behind a toggle. See NOTES_phase4.md.
function LoginScreen() {
  const [mode, setMode] = useState<'password' | 'magicLink'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setError(error.message);
  }

  async function handleMagicLinkSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return <p style={{ textAlign: 'center', marginTop: 80 }}>Check your email for a sign-in link.</p>;
  }

  return (
    <div style={{ maxWidth: 320, margin: '80px auto' }}>
      <h1 style={{ fontSize: 18 }}>Maestro — Calendar</h1>
      {mode === 'password' ? (
        <form onSubmit={handlePasswordSubmit}>
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: '100%', padding: 8, marginTop: 12, boxSizing: 'border-box' }}
          />
          <input
            type="password"
            required
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: '100%', padding: 8, marginTop: 8, boxSizing: 'border-box' }}
          />
          <button type="submit" disabled={busy} style={{ width: '100%', padding: 8, marginTop: 12 }}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleMagicLinkSubmit}>
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: '100%', padding: 8, marginTop: 12, boxSizing: 'border-box' }}
          />
          <button type="submit" style={{ width: '100%', padding: 8, marginTop: 12 }}>
            Send sign-in link
          </button>
        </form>
      )}
      {error && <p style={{ color: '#ff5b6e' }}>{error}</p>}
      <button
        onClick={() => {
          setError(null);
          setMode((m) => (m === 'password' ? 'magicLink' : 'password'));
        }}
        style={{
          marginTop: 12,
          background: 'none',
          border: 'none',
          color: '#8a8aa3',
          cursor: 'pointer',
          fontSize: 12,
          textDecoration: 'underline',
        }}
      >
        {mode === 'password' ? 'No password set yet? Use a one-time email link' : 'Use password instead'}
      </button>
    </div>
  );
}

// Lets you set (or change) your password from within an active session —
// supabase.auth.updateUser works on the logged-in session directly, no
// admin API or old password needed. Do this once via a magic-link login,
// then use password sign-in from then on.
function SetPasswordControl() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage('Saved.');
    setPassword('');
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{ background: 'none', border: 'none', color: COLORS.muted, cursor: 'pointer', fontSize: 12 }}
      >
        Set password
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <input
        type="password"
        required
        minLength={6}
        placeholder="New password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ padding: 4, fontSize: 12 }}
      />
      <button type="submit" disabled={busy} style={{ fontSize: 12 }}>
        {busy ? 'Saving…' : 'Save'}
      </button>
      {message && <span style={{ fontSize: 12, color: COLORS.muted }}>{message}</span>}
    </form>
  );
}

function GoogleConnectPrompt({ onConnected }: { onConnected: () => void }) {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConnect() {
    setConnecting(true);
    setError(null);
    try {
      await startGoogleConnect(); // navigates away on success
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start Google connect');
      setConnecting(false);
    }
  }

  return (
    <div style={{ maxWidth: 360, margin: '80px auto', textAlign: 'center' }}>
      <p>Connect your Google Calendar to enable sync (optional, per-event, can be undone any time).</p>
      <button onClick={handleConnect} disabled={connecting} style={{ padding: '8px 16px' }}>
        {connecting ? 'Redirecting…' : 'Connect Google Calendar'}
      </button>
      {error && <p style={{ color: '#ff5b6e' }}>{error}</p>}
      <div>
        <button onClick={onConnected} style={{ marginTop: 12, background: 'none', border: 'none', color: '#8a8aa3', cursor: 'pointer' }}>
          Skip for now
        </button>
      </div>
    </div>
  );
}

export default function CalendarApp() {
  const [session, setSession] = useState<Session | null | undefined>(undefined); // undefined = loading
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null);
  const [googleAuthBanner] = useState<GoogleAuthStatus>(() => readGoogleAuthStatusFromUrl());
  const [skippedGoogle, setSkippedGoogle] = useState(false);
  const [detailMode, setDetailMode] = useState<EventDetailMode>('closed');
  const [selectedInstance, setSelectedInstance] = useState<EventInstance | null>(null);
  const [createDefaults, setCreateDefaults] = useState<{ date: string; allDay: boolean; startHour?: number; endHour?: number } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [tab, setTab] = useState<Tab>('daily');
  const [date, setDate] = useState<string>(() => todayDateStr());
  const [syncErrors, setSyncErrors] = useState<string[]>([]);

  function openView(instance: EventInstance) {
    setSelectedInstance(instance);
    setCreateDefaults(null);
    setDetailMode('view');
  }

  function openCreate(defaults: { date: string; allDay: boolean; startHour?: number; endHour?: number }) {
    setSelectedInstance(null);
    setCreateDefaults(defaults);
    setDetailMode('create');
  }

  function closeDetail() {
    setDetailMode('closed');
    setSelectedInstance(null);
    setCreateDefaults(null);
  }

  // EventDetail itself decides when to close (immediately after a create/
  // edit save or a delete, but NOT after an in-place color toggle or push/
  // unpush — see EventDetail.tsx). This handler only needs to refresh data:
  // bump the underlying instance so a still-open modal reflects the latest
  // push/color state, and remount DailyView so its next fetch picks up
  // the change once the modal does close.
  function handleSaved(updated: SchedEvent) {
    setSelectedInstance({
      sourceEvent: updated,
      instanceStartTs: updated.start_ts,
      instanceEndTs: updated.end_ts,
      isOverride: false,
      isRecurring: false,
    });
    setRefreshKey((k) => k + 1);
  }

  function handleDeleted() {
    setRefreshKey((k) => k + 1);
  }

  function handleSyncComplete(results: SyncResult[]) {
    const failed = results.filter((r) => r.error).map((r) => `${r.calendarId}: ${r.error}`);
    setSyncErrors(failed);
    setRefreshKey((k) => k + 1);
  }

  useEffect(() => {
    getSession().then((s) => {
      if (s) {
        setSession(s);
      } else {
        const email = import.meta.env.VITE_CALENDAR_EMAIL;
        const pw = import.meta.env.VITE_CALENDAR_PASSWORD;
        if (email && pw) {
          supabase.auth.signInWithPassword({ email, password: pw }).then(({ data, error }) => {
            if (error) setSession(null);
            else setSession(data.session);
          });
        } else {
          setSession(null);
        }
      }
    });
    return onAuthStateChange(setSession);
  }, []);

  useEffect(() => {
    if (session) {
      isGoogleConnected().then(setGoogleConnected);
      supabase
        .from('sched_sync_log')
        .select('calendar_id, error, ran_at')
        .not('error', 'is', null)
        .order('ran_at', { ascending: false })
        .limit(5)
        .then(({ data }) => {
          if (data?.length) {
            const cutoff = Date.now() - 24 * 60 * 60 * 1000;
            const recent = data.filter((r) => new Date(r.ran_at).getTime() > cutoff);
            if (recent.length) {
              setSyncErrors(recent.map((r) => `${r.calendar_id}: ${r.error}`));
            }
          }
        });
    }
  }, [session]);

  if (session === undefined) {
    return <p style={{ color: COLORS.muted, textAlign: 'center', marginTop: 80 }}>Loading calendar…</p>;
  }

  if (!session) {
    return <p style={{ color: COLORS.danger, textAlign: 'center', marginTop: 80 }}>Calendar sign-in failed. Check VITE_CALENDAR_EMAIL / VITE_CALENDAR_PASSWORD.</p>;
  }

  if (googleConnected === null) {
    return <p style={{ color: COLORS.muted, textAlign: 'center', marginTop: 80 }}>Loading…</p>;
  }

  return (
    <div>
      <TabBar tab={tab} onChange={setTab} />
      <div style={{ paddingTop: 60 }}>
        {googleAuthBanner === 'connected' && (
          <p style={{ background: '#1e3a2e', padding: 8, textAlign: 'center' }}>Google Calendar connected.</p>
        )}
        {googleAuthBanner === 'denied' && (
          <p style={{ background: '#3a2e1e', padding: 8, textAlign: 'center' }}>Google connection was cancelled.</p>
        )}
        {googleAuthBanner === 'error' && (
          <p style={{ background: '#3a1e1e', padding: 8, textAlign: 'center' }}>Google connection failed — try again.</p>
        )}
        {syncErrors.length > 0 && (
          <div style={{ background: '#3a1e1e', padding: '8px 16px', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ flex: 1, fontSize: 13, color: COLORS.danger }}>
              <strong>Sync errors</strong>
              {syncErrors.map((msg) => (
                <p key={msg} style={{ margin: '4px 0 0' }}>{msg}</p>
              ))}
            </div>
            <button
              onClick={() => setSyncErrors([])}
              style={{ background: 'none', border: 'none', color: COLORS.muted, cursor: 'pointer', fontSize: 16, padding: 0 }}
            >
              ✕
            </button>
          </div>
        )}
        <DateNav
          tab={tab}
          date={date}
          onShift={(delta) => setDate((d) => shiftDate(d, delta))}
          onToday={() => setDate(todayDateStr())}
          onSyncComplete={handleSyncComplete}
        />
        {tab === 'daily' && (
          <DailyView
            key={`daily-${date}-${refreshKey}`}
            date={date}
            onSelectInstance={openView}
            onCreateNew={openCreate}
          />
        )}
        {tab === 'weekly' && (
          <WeeklyView
            key={`weekly-${sundayOfWeek(date)}-${refreshKey}`}
            weekStart={sundayOfWeek(date)}
            onSelectInstance={openView}
            onCreateNew={openCreate}
          />
        )}
        <EventDetail
          mode={detailMode}
          instance={selectedInstance}
          createDefaults={createDefaults}
          onClose={closeDetail}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
          onEdit={() => setDetailMode('edit')}
        />
      </div>
    </div>
  );
}

function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'daily', label: 'DAILY' },
    { id: 'weekly', label: 'WEEKLY' },
  ];
  return (
    <nav
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        top: 'calc(48px + env(safe-area-inset-top, 0px))',
        display: 'flex',
        justifyContent: 'space-around',
        background: COLORS.card,
        borderBottom: `1px solid ${COLORS.border}`,
        zIndex: 50,
      }}
    >
      {tabs.map((t) => {
        const active = t.id === tab;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            style={{
              flex: 1,
              background: 'transparent',
              border: 0,
              borderBottom: active ? `2px solid ${COLORS.primary}` : '2px solid transparent',
              padding: '12px 8px',
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: 0.5,
              color: active ? COLORS.primary : COLORS.muted,
              cursor: 'pointer',
            }}
          >
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}

function DateNav({
  tab,
  date,
  onShift,
  onToday,
  onSyncComplete,
}: {
  tab: Tab;
  date: string;
  onShift: (delta: number) => void;
  onToday: () => void;
  onSyncComplete: (results: SyncResult[]) => void;
}) {
  const step = tab === 'daily' ? 1 : 7;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 16px',
        borderBottom: `1px solid ${COLORS.border}`,
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => onShift(-step)} style={navBtnStyle}>
          ‹
        </button>
        <button onClick={() => onShift(step)} style={navBtnStyle}>
          ›
        </button>
      </div>
      <div
        style={{
          color: COLORS.text,
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        {tab === 'daily'
          ? formatDailyHeader(date)
          : `Week ${isoWeek(shiftDate(sundayOfWeek(date), 1))}`}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <SyncButton onSyncComplete={onSyncComplete} />
        <button onClick={onToday} style={navBtnStyle}>
          Today
        </button>
      </div>
    </div>
  );
}

const navBtnStyle: React.CSSProperties = {
  padding: '4px 10px',
  background: 'none',
  border: `1px solid ${COLORS.border}`,
  borderRadius: 4,
  color: COLORS.text,
  cursor: 'pointer',
  fontSize: 12,
};
