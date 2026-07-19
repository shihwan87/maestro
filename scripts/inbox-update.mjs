#!/usr/bin/env node
// Update one claude_requests row's status and optional fields.
// Usage: node scripts/inbox-update.mjs <id> <status> [--tier X] [--proposal S] [--response S] [--commit SHA] [--error S]
// Positional `<status>` maps to claude_requests.status (open|proposed|executing|done|dismissed|failed).
// Also sets proposed_at / approved_at / completed_at timestamps as appropriate.

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const root = dirname(fileURLToPath(import.meta.url)) + '/..'
const envPath = join(root, '.env')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY
if (!url || !key) { console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_KEY'); process.exit(1) }

const [id, status, ...rest] = process.argv.slice(2)
if (!id || !status) { console.error('Usage: inbox-update.mjs <id> <status> [flags]'); process.exit(1) }

// Parse --flag value pairs
const flags = {}
for (let i = 0; i < rest.length; i += 2) {
  const key = rest[i]?.replace(/^--/, '')
  const val = rest[i + 1]
  if (key && val !== undefined) flags[key] = val
}

const patch = { status }
if (flags.tier)     patch.tier       = flags.tier
if (flags.proposal) patch.proposal   = flags.proposal
if (flags.response) patch.response   = flags.response
if (flags.commit)   patch.commit_sha = flags.commit
if (flags.error)    patch.error      = flags.error
if (flags.run)      patch.run_id     = flags.run

const now = new Date().toISOString()
if (status === 'proposed')  patch.proposed_at  = now
if (status === 'executing') patch.approved_at  = now
if (status === 'done')      patch.completed_at = now
if (status === 'failed')    patch.completed_at = now

const sb = createClient(url, key)
const { error } = await sb.from('claude_requests').update(patch).eq('id', id)
if (error) { console.error(error.message); process.exit(1) }
console.log(`${id} → ${status}`)
