// Purpose: singleton Supabase client + auth session helpers.
// Inputs: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (same Supabase project
// as schemanager, see schedule_manager_claudecode_prompt.md Stack section).
// Outputs: a shared `supabase` client every other frontend module imports.
// Architecture note: unlike schemanager (single-PIN, RLS off), this app
// uses real Supabase Auth — every sched_* table's RLS policy checks
// auth.uid(), so a logged-in session is required before any sched_* query
// will return rows.

import { createClient, type Session } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.warn('[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
}

export const supabase = createClient(url, key);

export async function getSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error('[supabase] getSession failed', error);
    return null;
  }
  return data.session;
}

export function onAuthStateChange(callback: (session: Session | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}
