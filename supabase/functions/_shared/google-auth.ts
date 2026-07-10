// Purpose: Google OAuth 2.0 Authorization Code flow — consent URL, code
// exchange, refresh, and per-user token storage in sched_google_auth.
// Inputs: GOOGLE_CLIENT_ID/SECRET (manually set), SUPABASE_URL/
// SUPABASE_SERVICE_ROLE_KEY (auto-provided by the Supabase Edge Function
// runtime — never set these two manually).
// Outputs: access tokens ready to use against the Calendar/Drive REST APIs.
// Architecture note: every other module that needs to call Google gets its
// token exclusively through getValidAccessToken — nothing else reads
// sched_google_auth directly, so refresh logic lives in exactly one place.

import { createClient } from 'npm:@supabase/supabase-js@2';
import type { GoogleAuthTokens, GoogleAuthRow } from './types.ts';
import { GoogleAuthError } from './types.ts';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
// calendar.events (not the broader `calendar` scope) is sufficient: every
// calendar this app touches (WORK_CAL_ID/PERSONAL_CAL_ID/HOLIDAY_CAL_IDS)
// comes from env vars, not discovery — the app never lists/creates/manages
// calendars themselves, only reads/writes events on known calendar ids.
// Matches the scope schemanager's own Google integration already uses, so
// no new scope needs approval on the (unverified, testing-mode) OAuth
// consent screen.
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
];
// Expiry buffer: refresh a token this many seconds early, so a slow
// downstream call never races an already-expired token.
const EXPIRY_BUFFER_SECONDS = 300;

function redirectUri(): string {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  if (!supabaseUrl) throw new Error('SUPABASE_URL not set');
  return `${supabaseUrl}/functions/v1/google-oauth-callback`;
}

function adminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

export function buildAuthUrl(state: string): string {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID not set');
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(),
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES.join(' '),
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<GoogleAuthTokens> {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new Error('GOOGLE_CLIENT_ID/SECRET not set');

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri(),
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) {
    throw new GoogleAuthError(`Token exchange failed: ${res.status} ${await res.text()}`);
  }
  const body = await res.json();
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? null,
    expiresAt: new Date(Date.now() + body.expires_in * 1000).toISOString(),
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<GoogleAuthTokens> {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new Error('GOOGLE_CLIENT_ID/SECRET not set');

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    throw new GoogleAuthError(`Token refresh failed: ${res.status} ${await res.text()}`);
  }
  const body = await res.json();
  return {
    accessToken: body.access_token,
    // Google does not re-issue a refresh token on refresh calls.
    refreshToken: null,
    expiresAt: new Date(Date.now() + body.expires_in * 1000).toISOString(),
  };
}

export async function storeTokens(userId: string, tokens: GoogleAuthTokens): Promise<void> {
  const supabase = adminClient();
  const row: Partial<GoogleAuthRow> & { user_id: string } = {
    user_id: userId,
    access_token: tokens.accessToken,
    expires_at: tokens.expiresAt,
    updated_at: new Date().toISOString(),
  };
  // Never overwrite refresh_token with null — refresh calls don't return one.
  if (tokens.refreshToken) {
    row.refresh_token = tokens.refreshToken;
  }
  const { error } = await supabase.from('sched_google_auth').upsert(row, { onConflict: 'user_id' });
  if (error) throw new GoogleAuthError(`storeTokens failed: ${error.message}`);
}

// --- OAuth `state` signing (addition beyond interface_contract.md's
// original 5 functions — see NOTES_phase1.md "why a signed state token").
// The callback leg (Google redirecting back with ?code=&state=) is a plain
// browser navigation with no Supabase session attached, so the only way to
// know *which* Supabase user this callback belongs to is to have encoded
// that in `state` when the flow started, and verify nobody tampered with it.

interface StatePayload {
  uid: string;
  nonce: string;
  exp: number; // unix ms
}

const STATE_TTL_MS = 5 * 60 * 1000;

function base64UrlEncode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  // Standard base64 strings are padded with '=' to a multiple of 4 chars;
  // base64url (used in URLs/query params) strips that padding, so add it
  // back before handing off to atob, which requires it.
  const paddingNeeded = (4 - (base64.length % 4)) % 4;
  const padded = base64 + '='.repeat(paddingNeeded);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

async function hmacKey(): Promise<CryptoKey> {
  const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!secret) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set');
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function signState(userId: string): Promise<string> {
  const payload: StatePayload = {
    uid: userId,
    nonce: crypto.randomUUID(),
    exp: Date.now() + STATE_TTL_MS,
  };
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const key = await hmacKey();
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, payloadBytes));
  return `${base64UrlEncode(payloadBytes)}.${base64UrlEncode(signature)}`;
}

export async function verifyState(state: string): Promise<string> {
  const [payloadPart, sigPart] = state.split('.');
  if (!payloadPart || !sigPart) throw new GoogleAuthError('Malformed state param');
  const payloadBytes = base64UrlDecode(payloadPart);
  const signature = base64UrlDecode(sigPart);
  const key = await hmacKey();
  const valid = await crypto.subtle.verify('HMAC', key, signature, payloadBytes);
  if (!valid) throw new GoogleAuthError('Invalid state signature');
  const payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as StatePayload;
  if (Date.now() > payload.exp) throw new GoogleAuthError('State token expired');
  return payload.uid;
}

export async function getValidAccessToken(userId: string): Promise<string> {
  const supabase = adminClient();
  const { data, error } = await supabase
    .from('sched_google_auth')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new GoogleAuthError(`getValidAccessToken read failed: ${error.message}`);
  if (!data) throw new GoogleAuthError(`No Google connection for user ${userId}`);

  const row = data as GoogleAuthRow;
  const expiresAtMs = new Date(row.expires_at).getTime();
  const isNearExpiry = expiresAtMs - Date.now() < EXPIRY_BUFFER_SECONDS * 1000;
  if (!isNearExpiry) return row.access_token;

  const refreshed = await refreshAccessToken(row.refresh_token);
  await storeTokens(userId, refreshed);
  return refreshed.accessToken;
}
