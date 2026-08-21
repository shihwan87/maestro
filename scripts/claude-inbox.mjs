#!/usr/bin/env node
// Prints all actionable Claude requests from the schemanager app —
// 'open' rows plus 'revising' rows (a proposal the user replied to instead
// of approving outright; user_note holds what they said).
// Reads VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from .env.
// Usage: npm run claude:inbox  [--all]
//   --all   include done + dismissed too

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

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY
if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env')
  process.exit(1)
}

const supabase = createClient(url, key)
const all = process.argv.includes('--all')

let q = supabase.from('claude_requests').select('*').order('created_at', { ascending: false })
if (!all) q = q.in('status', ['open', 'revising'])

const { data, error } = await q
if (error) { console.error(error.message); process.exit(1) }

if (!data.length) {
  console.log(all ? 'No requests.' : 'No open requests.')
  process.exit(0)
}

for (const r of data) {
  const when = new Date(r.created_at).toLocaleString()
  console.log(`\n[${r.status.toUpperCase()}]  ${when}`)
  console.log(`id: ${r.id}`)
  console.log(r.text)
  if (r.proposal && r.status === 'revising') console.log(`proposal:
${r.proposal}`)
  if (r.user_note) console.log(`user reply: ${r.user_note}`)
  if (r.response) console.log(`reply: ${r.response}`)
}
console.log(`\n${data.length} request${data.length === 1 ? '' : 's'}.`)
