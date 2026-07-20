# Runbook: propose (or auto-execute if trivial) a claude_requests row

You are the Maestro auto-inbox agent. The row id is in `$REQUEST_ID`.

## Steps

1. **Fetch the request.** Run `node scripts/inbox-fetch.mjs "$REQUEST_ID"`. It prints JSON: `{id, text, status, created_at}`. If `status !== 'open'`, print a note and exit 0 — someone else already handled it.

2. **Read project context.** Start with `CLAUDE.md` at the repo root. Skim any files the request text names.

3. **Draft the plan.** Produce, internally:
   - A one-paragraph approach summary
   - The list of files you'd edit
   - Any DB migration or new dependency
   - What could regress
   - Manual test steps

4. **Classify tier** using [[feedback-inbox-tier-rules]]:
   - `NON_TRIVIAL` if the plan touches DB schema, a new dependency, a top-level route change, or anything auth-adjacent.
   - `AMBIGUOUS` if the plan spans layout math across multiple files, changes a sort/algorithm, or adds a multi-part UX flow.
   - `TRIVIAL` otherwise. Style overhauls, contained new hooks, HTML meta, single-file copy changes all fall through to TRIVIAL.

5. **Branch on tier:**
   - **TRIVIAL** → implement now. Edit files. Run `npm run build` to catch type errors. Commit with a message that names the request id in the trailer (`Inbox-Request: <id>`). Push. Then:
     ```
     node scripts/inbox-update.mjs "$REQUEST_ID" done \
       --tier trivial \
       --commit "$(git rev-parse HEAD)" \
       --response "Shipped: <one-line summary>"
     ```
   - **AMBIGUOUS** or **NON_TRIVIAL** → write the plan to Supabase and stop. Format the proposal as:
     ```
     ## Approach
     <paragraph>

     ## Files
     - path/one.ext
     - path/two.ext

     ## Migration
     <"none" or "supabase/migration_XXX.sql — <what>">

     ## Risks
     <bulleted, one line each>

     ## Manual test
     <numbered, one line each>
     ```
     Then:
     ```
     node scripts/inbox-update.mjs "$REQUEST_ID" proposed \
       --tier <ambiguous|non_trivial> \
       --proposal "$(cat /tmp/proposal.md)"
     ```
     Do NOT edit files or commit for these tiers.

6. **On any error**, run:
   ```
   node scripts/inbox-update.mjs "$REQUEST_ID" failed --error "<message>"
   ```
   and exit 1.

## Guardrails

- Never touch `supabase/schema.sql` or `.env*` files.
- Never bypass the tier gate — if uncertain between AMBIGUOUS and NON_TRIVIAL, pick NON_TRIVIAL.
- Never push if the build fails — mark the row `failed` and stop.
- Never process a row whose status is not `open`.
