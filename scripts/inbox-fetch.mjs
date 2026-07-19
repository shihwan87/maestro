#!/usr/bin/env node
// Fetch one claude_requests row by id and print it as JSON.
// Usage: node scripts/inbox-fetch.mjs <request_id>
// Reads SUPABASE_URL and SUPABASE_SERVICE_KEY from env (workflow provides them);
// falls back to VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from .env for local runs.

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

const id = process.argv[2]
if (!id) { console.error('Usage: inbox-fetch.mjs <request_id>'); process.exit(1) }

const sb = createClient(url, key)
const { data, error } = await sb.from('claude_requests').select('*').eq('id', id).single()
if (error) { console.error(error.message); process.exit(1) }
console.log(JSON.stringify(data, null, 2))
