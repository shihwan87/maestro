# Auto-inbox setup

End-to-end wiring for the CONFIG-tab → Claude → git → PWA loop.

## Data flow

```
[user types request in CONFIG tab]
        │  (INSERT claude_requests)
        ▼
[Supabase Webhook A]  ──repository_dispatch inbox-new──▶  [GH Action: inbox-propose]
                                                                │
                                                                ▼
                              ┌── tier=trivial ──▶ implements, commits, marks done
                              │
                              └── tier=ambig/nontriv ──▶ writes proposal, marks 'proposed'
                                                                │
                                                                ▼
                                          [user reviews in CONFIG tab, hits Approve]
                                                                │  (UPDATE status='executing')
                                                                ▼
[Supabase Webhook B] ──repository_dispatch inbox-approved──▶ [GH Action: inbox-execute]
                                                                │
                                                                ▼
                                          implements, commits, pushes, marks 'done'
```

## One-time setup

### 1. Apply the migration

Run `supabase/migration_009.sql` in the Supabase SQL editor.

### 2. Create GitHub secrets

In `shihwan87/maestro` → Settings → Secrets and variables → Actions, add:

| Secret name             | Where to get it                                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`     | https://console.anthropic.com/settings/keys — create a key scoped to this project.                  |
| `SUPABASE_URL`          | Same value as `VITE_SUPABASE_URL` (already in secrets).                                             |
| `SUPABASE_SERVICE_KEY`  | Supabase → Project Settings → API → **service_role** key. Bypasses RLS; treat as sensitive.         |

### 3. Create a GitHub Personal Access Token

Supabase's webhook needs to trigger `repository_dispatch` on the maestro repo. GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → **Generate new token**.

- Resource owner: `shihwan87`
- Repository access: **Only select repositories** → `maestro`
- Repository permissions:
  - Contents: Read
  - Metadata: Read (auto)
  - **Actions: Read and write** (this is the one that grants dispatch)
- Expiration: 1 year

Copy the token — you paste it into Supabase in the next step.

### 4. Configure Supabase webhooks

Supabase Dashboard → Database → Webhooks → **Create a new hook**.

**Webhook A — `inbox-new`:**
- Name: `inbox-propose-dispatch`
- Table: `claude_requests`
- Events: **Insert**
- Type: **HTTP Request**
- Method: `POST`
- URL: `https://api.github.com/repos/shihwan87/maestro/dispatches`
- HTTP Headers:
  ```
  Accept: application/vnd.github+json
  Authorization: Bearer <the-PAT-from-step-3>
  X-GitHub-Api-Version: 2022-11-28
  ```
- HTTP Params: none
- Body:
  ```json
  {"event_type":"inbox-new","client_payload":{"request_id":"{{ record.id }}"}}
  ```

**Webhook B — `inbox-approved`:**
- Same as above but:
- Events: **Update**
- Conditions (filter): `record.status = 'executing' AND old_record.status != 'executing'`
  (Supabase Webhooks UI has a "Conditions" panel — use it, or handle it in the payload template.)
- Body:
  ```json
  {"event_type":"inbox-approved","client_payload":{"request_id":"{{ record.id }}"}}
  ```

### 5. Rotate the PWA build

Bump the deployed PWA so users see the new CONFIG-tab UI:
```bash
cd schemanager
git pull
git push  # trivial no-op push if you already merged; else the ConfigTab change ships on next deploy
```

## Testing end-to-end

1. From the CONFIG tab, submit a trivial request like "Change the CONFIG tab subtitle to 'Send me a request'."
2. Watch the row: it should go `open` → `done` (with a commit sha link) within ~1–2 minutes. No approval needed.
3. Now try a non-trivial one: "Add a 'starred' column to projects and let users pin projects to the top of the list."
4. Row goes `open` → `proposed` with a formatted plan. Tap **Approve & run** — it flips to `executing`, then `done`.

## Remote confirmation via Cowork (fallback for ambiguous cases)

The CONFIG tab is the primary approval surface, but for ambiguous rows where you want to *discuss* the proposal instead of just yes/no, use Cowork:

1. On any device, open https://claude.ai → the maestro workspace.
2. Cowork opens a Claude session with the repo already checked out. Say:
   > Read claude_requests row `<id>`, walk me through the proposal, and answer questions about the tradeoffs. When I'm satisfied, either update the proposal in Supabase or flip status to 'executing' to approve as-is.
3. Cowork sessions run on Anthropic's infrastructure, so this works from your phone, laptop, or anywhere with a browser.

Cowork does **not** need any of the setup above — it's independent from the automated GH-Action pipeline. Use the pipeline for hands-off items and Cowork for anything you want to talk through.

## Troubleshooting

- **Nothing happens after submitting.** Check GH Actions → the `inbox-propose` workflow should have a run. If not: Supabase Webhook A misconfigured. Test it via Supabase Dashboard → Webhooks → **Send test payload**.
- **Row stuck in `executing`.** GH Actions run may have failed silently. Check the run logs. The `Record failure` step at the bottom of each workflow should have written the error to the row.
- **Wrong tier assigned.** Update the runbook in `.github/prompts/inbox-propose.md`, section "Classify tier". The rules come from [`feedback_inbox_tier_rules.md`](../../CLAUDE.md) in your memory — keep them in sync.
- **Retry a failed row.** In the CONFIG tab, `failed` rows show a Retry button that flips status back to `open` and clears `error`.
