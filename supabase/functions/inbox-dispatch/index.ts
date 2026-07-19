// Purpose: bridge Supabase Database Webhooks → GitHub repository_dispatch.
// Supabase webhooks send a fixed { type, table, record, old_record } payload;
// GitHub's dispatch API needs { event_type, client_payload }. This function
// does the translation and also gates UPDATEs so only the open→executing
// transition (user hitting Approve in the CONFIG tab) fires inbox-approved.
//
// Inputs: DatabaseWebhookPayload<ClaudeRequestRow> from a Supabase webhook
// configured on the claude_requests table (Insert + Update events).
// Outputs: 200 always so Supabase doesn't spin on retries. Failures are
// logged to sched_sync_log with calendar_id='inbox-dispatch'.
// Secrets: GITHUB_PAT (fine-grained token, Actions: read+write on maestro).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, handlePreflight } from '../_shared/cors.ts';

const GITHUB_DISPATCH_URL = 'https://api.github.com/repos/shihwan87/maestro/dispatches';

interface ClaudeRequestRow {
  id: string;
  status: 'open' | 'proposed' | 'executing' | 'done' | 'dismissed' | 'failed';
  text: string;
}

interface DatabaseWebhookPayload<T> {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: 'claude_requests';
  record: T | null;
  old_record: T | null;
}

function adminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

async function logError(message: string): Promise<void> {
  try {
    await adminClient().from('sched_sync_log').insert({
      calendar_id: 'inbox-dispatch',
      error: message,
      ran_at: new Date().toISOString(),
    });
  } catch {
    // If logging itself fails, swallow — a 200 is still returned to Supabase.
  }
}

async function fireGitHub(eventType: string, requestId: string): Promise<void> {
  const pat = Deno.env.get('GITHUB_PAT');
  if (!pat) throw new Error('GITHUB_PAT secret missing');
  const res = await fetch(GITHUB_DISPATCH_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${pat}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'maestro-inbox-dispatch',
    },
    body: JSON.stringify({
      event_type: eventType,
      client_payload: { request_id: requestId },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub dispatch ${res.status}: ${body.slice(0, 200)}`);
  }
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  let payload: DatabaseWebhookPayload<ClaudeRequestRow>;
  try {
    payload = await req.json();
  } catch {
    await logError('Invalid JSON body');
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  try {
    if (payload.type === 'INSERT' && payload.record?.status === 'open') {
      await fireGitHub('inbox-new', payload.record.id);
    } else if (
      payload.type === 'UPDATE' &&
      payload.record?.status === 'executing' &&
      payload.old_record?.status !== 'executing'
    ) {
      await fireGitHub('inbox-approved', payload.record.id);
    }
    // All other cases are ignored (dismissed, retries, proposal writes, etc.).
  } catch (err) {
    await logError(err instanceof Error ? err.message : String(err));
  }

  return new Response('ok', { status: 200, headers: corsHeaders });
});
