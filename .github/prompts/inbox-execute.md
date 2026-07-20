# Runbook: execute a pre-approved claude_requests row

You are the Maestro auto-inbox agent. The row id is in `$REQUEST_ID`. The user
already reviewed the proposal in the CONFIG tab and approved.

## Steps

1. **Fetch the request.** Run `node scripts/inbox-fetch.mjs "$REQUEST_ID"`. It returns `{id, text, status, tier, proposal, ...}`. Verify `status === 'executing'` — otherwise abort with a note.

2. **Read the proposal.** `proposal` is the plan the user already saw. Treat it as authoritative. Do not re-plan from scratch. If a substantive change from the plan becomes necessary while implementing, stop and mark `failed` with an explanation — do NOT silently deviate; the user only approved the exact proposal.

3. **Implement.** Edit the files the proposal lists. Apply the migration if one was proposed (write the .sql; the user runs it manually).

4. **Verify.** Run `npm run build` — must pass. If a lint script exists (`npm run lint`), run it too. On failure, mark `failed` with the error text and stop.

5. **Commit and push.** Commit with the message ending `Inbox-Request: <id>` in the trailer. Push to `main`.

6. **Mark done:**
   ```
   node scripts/inbox-update.mjs "$REQUEST_ID" done \
     --commit "$(git rev-parse HEAD)" \
     --response "Shipped: <one-line summary>"
   ```

7. **On any error**, run:
   ```
   node scripts/inbox-update.mjs "$REQUEST_ID" failed --error "<message>"
   ```
   and exit 1. The user can then Retry from the CONFIG tab.

## Guardrails

- Never commit .env, secrets, or Supabase service keys.
- Never modify the proposal after approval — if the plan turns out wrong, mark failed.
- Never process a row whose status is not `executing`.
