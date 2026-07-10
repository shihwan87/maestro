// Purpose: entry point for the Google OAuth 2.0 Authorization Code flow.
// Handles two distinct legs behind one URL (interface_contract.md module 17):
//   1. "start" — an authenticated frontend call that returns the Google
//      consent-screen URL to navigate to.
//   2. "callback" — Google's own browser redirect back with ?code=&state=.
// Inputs: leg 1 needs a Supabase user JWT (Authorization header, attached
// automatically by supabase.functions.invoke); leg 2 needs the query params
// Google appends to the redirect.
// Outputs: leg 1 returns { authUrl } JSON; leg 2 is a 302 redirect back to
// FRONTEND_URL with a success/failure indicator.
// Architecture note: identifying *which* Supabase user a plain-browser
// Google redirect belongs to is the crux of this module — solved with a
// signed, short-lived `state` token (google-auth.ts's signState/verifyState)
// rather than a real request body, since Google's redirect can't carry one.
// This two-leg split, and the signed-state mechanism, are additions beyond
// interface_contract.md's original handler description — see
// NOTES_phase1.md for the plain-language version.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildAuthUrl, exchangeCodeForTokens, storeTokens, signState, verifyState } from '../_shared/google-auth.ts';
import { corsHeaders, handlePreflight } from '../_shared/cors.ts';

function frontendUrl(): string {
  const url = Deno.env.get('FRONTEND_URL');
  if (!url) throw new Error('FRONTEND_URL not set');
  return url;
}

async function userIdFromAuthHeader(req: Request): Promise<string> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) throw new Error('Missing Authorization header');
  const jwt = authHeader.replace(/^Bearer /i, '');
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const { data, error } = await supabase.auth.getUser(jwt);
  if (error || !data.user) throw new Error('Invalid session');
  return data.user.id;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const googleError = url.searchParams.get('error');

  // Leg 2: Google's redirect back to us.
  if (code || state || googleError) {
    if (googleError) {
      return Response.redirect(`${frontendUrl()}/?google_auth=denied`, 302);
    }
    if (!code || !state) {
      return Response.redirect(`${frontendUrl()}/?google_auth=error`, 302);
    }
    try {
      const userId = await verifyState(state);
      const tokens = await exchangeCodeForTokens(code);
      await storeTokens(userId, tokens);
      return Response.redirect(`${frontendUrl()}/?google_auth=connected`, 302);
    } catch (err) {
      console.error('google-oauth-callback: callback leg failed', err);
      return Response.redirect(`${frontendUrl()}/?google_auth=error`, 302);
    }
  }

  // Leg 1: authenticated frontend request starting the flow.
  try {
    const userId = await userIdFromAuthHeader(req);
    const state = await signState(userId);
    const authUrl = buildAuthUrl(state);
    return new Response(JSON.stringify({ authUrl }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('google-oauth-callback: start leg failed', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
