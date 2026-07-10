// Purpose: shared CORS headers for every Edge Function invoked directly
// from the browser via supabase.functions.invoke(...).
// Inputs/outputs: none — just header constants + an OPTIONS preflight helper.
// Architecture note: not listed as its own module in interface_contract.md;
// added because every invoke()-called function (event-crud, task-export,
// sync-run, report-generate) needs identical CORS handling and duplicating
// it per function would violate "no reimplementing logic that belongs to
// another module."

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export function handlePreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  return null;
}
