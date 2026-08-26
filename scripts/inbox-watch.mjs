#!/usr/bin/env node
// Maestro inbox watcher.
//
// Long-lived process that fires a headless Claude Code run as soon as a new
// CONFIG-tab request lands, instead of waiting for the cron safety net.
// Supabase cannot push to a laptop with no public address, so the "trigger"
// is this local listener on the same Realtime channel the CONFIG tab uses.
//
// Usage:  npm run claude:watch
// Stop:   Ctrl-C (or stop the Task Scheduler task)
//
// Env overrides (all optional):
//   CLAUDE_BIN                  path to the claude CLI      (default: 'claude')
//   INBOX_WATCH_DEBOUNCE_MS     quiet period before firing  (default: 5000)
//   INBOX_WATCH_TIMEOUT_MS      kill a stuck run after this (default: 900000)
//   INBOX_WATCH_PERMISSION_MODE claude --permission-mode    (default: 'bypassPermissions')
//   INBOX_WATCH_DRY_RUN         '1' = log instead of spawning Claude

import { readFileSync, existsSync, mkdirSync, appendFileSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// ---------------------------------------------------------------- env + paths

const envPath = join(root, '.env')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY
if (!url || !key) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_KEY (or the VITE_ equivalents) in .env')
  process.exit(1)
}

const logDir = join(root, 'logs')                      // gitignored
const logFile = join(logDir, 'inbox-watch.log')
const lockFile = join(logDir, 'inbox-run.lock')
mkdirSync(logDir, { recursive: true })

const DEBOUNCE_MS = Number(process.env.INBOX_WATCH_DEBOUNCE_MS) || 5_000
const TIMEOUT_MS = Number(process.env.INBOX_WATCH_TIMEOUT_MS) || 15 * 60 * 1000
const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude'
const PERM_MODE = process.env.INBOX_WATCH_PERMISSION_MODE || 'bypassPermissions'
const DRY_RUN = process.env.INBOX_WATCH_DRY_RUN === '1'
const ACTIONABLE = ['open', 'revising']
const HEALTHY_AFTER_MS = 30_000   // a link that held this long earns a backoff reset

// The headless run follows the same instructions the cron task uses, so there
// is exactly one definition of "how an inbox row gets processed".
const TASK_FILE = join(
  process.env.USERPROFILE || process.env.HOME || '',
  '.claude', 'scheduled-tasks', 'maestro-inbox-daily', 'SKILL.md',
)
const PROMPT = [
  `Read ${TASK_FILE} and follow it exactly, start to finish.`,
  'You were triggered by the local inbox watcher because a new request just arrived,',
  'not by the cron schedule - everything else about the procedure is unchanged.',
  'Run non-interactively: make reasonable choices, ask nothing, and stay silent if the inbox is empty.',
].join(' ')

// -------------------------------------------------------------------- logging

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`
  console.log(line)
  try { appendFileSync(logFile, line + '\n') } catch { /* logging must never kill the watcher */ }
}

// ------------------------------------------------------------------- run lock
// Guards against two triggers (watcher + cron, or a burst of inserts) starting
// concurrent Claude sessions in the same working tree. A lock older than the
// run timeout is treated as abandoned - e.g. the watcher was killed mid-run.

function readLock() {
  if (!existsSync(lockFile)) return null
  try { return JSON.parse(readFileSync(lockFile, 'utf8')) } catch { return null }
}

function lockIsStale(lock) {
  return !lock?.startedAt || Date.now() - Date.parse(lock.startedAt) > TIMEOUT_MS
}

function acquireLock() {
  const held = readLock()
  if (held && !lockIsStale(held)) return false
  if (held) log(`clearing a stale lock from pid ${held.pid} (started ${held.startedAt})`)
  writeFileSync(lockFile, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }))
  return true
}

function releaseLock() {
  try { rmSync(lockFile, { force: true }) } catch { /* nothing useful to do */ }
}

// -------------------------------------------------------------------- the run

let running = false
let rerunRequested = false   // a row landed mid-run; sweep again when this one ends

function runClaude(reason) {
  if (running) { rerunRequested = true; log(`run already in flight - queued a re-check (${reason})`); return }
  if (!acquireLock()) { rerunRequested = true; log('another process holds the run lock - will retry after it clears'); return }

  running = true
  log(`starting headless Claude run (${reason})`)

  if (DRY_RUN) {
    log(`DRY RUN - would have spawned: ${CLAUDE_BIN} -p <inbox prompt> --permission-mode ${PERM_MODE}`)
    finish(0)
    return
  }

  const child = spawn(CLAUDE_BIN, ['-p', PROMPT, '--permission-mode', PERM_MODE], {
    cwd: root,
    shell: process.platform === 'win32',   // claude is a .cmd shim on Windows
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const killTimer = setTimeout(() => {
    log(`run exceeded ${Math.round(TIMEOUT_MS / 60000)} min - killing it`)
    child.kill()
  }, TIMEOUT_MS)

  const relay = (buf) => String(buf).split(/\r?\n/).filter(Boolean).forEach((l) => log(`  | ${l}`))
  child.stdout.on('data', relay)
  child.stderr.on('data', relay)

  child.on('error', (err) => { clearTimeout(killTimer); log(`failed to start Claude: ${err.message}`); finish(null) })
  child.on('close', (code) => { clearTimeout(killTimer); log(`run finished (exit ${code})`); finish(code) })
}

function finish() {
  running = false
  releaseLock()
  if (rerunRequested) {
    rerunRequested = false
    log('re-checking - work arrived while the last run was in flight')
    schedule('queued re-check')
  }
}

// --------------------------------------------------------------------- trigger

let debounceTimer = null

// Collapse a burst of inserts into one run, and give the row time to settle.
function schedule(reason) {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => runClaude(reason), DEBOUNCE_MS)
  log(`trigger: ${reason} - firing in ${DEBOUNCE_MS / 1000}s`)
}

const sb = createClient(url, key)

// If a run leaves rows exactly as it found them - Claude crashed, or the rows
// are ones it refuses to touch - the heartbeat would otherwise re-fire on them
// forever. Remember the last set we swept and leave it alone for a while.
let lastSweptSignature = null
let lastSweptAt = 0
const SWEEP_COOLDOWN_MS = 60 * 60 * 1000

// Rows inserted while the watcher was down never produce an INSERT event, so
// every (re)connect sweeps for actionable rows before trusting the stream.
async function catchUp(label) {
  const { data, error } = await sb.from('claude_requests').select('id').in('status', ACTIONABLE)
  if (error) { log(`catch-up query failed: ${error.message}`); return }
  if (!data.length) { lastSweptSignature = null; log(`${label}: inbox clear`); return }

  const signature = data.map((r) => r.id).sort().join(',')
  if (signature === lastSweptSignature && Date.now() - lastSweptAt < SWEEP_COOLDOWN_MS) {
    log(`${label}: same ${data.length} row(s) as the last sweep - holding off`)
    return
  }
  lastSweptSignature = signature
  lastSweptAt = Date.now()
  schedule(`${label}: ${data.length} actionable row(s) waiting`)
}

// ------------------------------------------------------------ realtime + retry
// Realtime websockets die on sleep/resume and on network changes without ever
// recovering on their own, so a dropped channel is torn down and rebuilt.

let channel = null
let generation = 0        // every rebuild bumps this; older channels go quiet
let backoffMs = 1_000
let reconnectTimer = null
let connectedAt = 0

// Tearing a channel down fires its own subscribe callback with CLOSED, and a
// replacement sharing the old topic name makes the client close one of them.
// Both look exactly like a dropped connection, so without the generation guard
// and the per-generation topic the first real drop turns into a reconnect loop.
function connect() {
  clearTimeout(reconnectTimer)
  const myGen = ++generation

  if (channel) {
    const stale = channel
    channel = null
    try { sb.removeChannel(stale) } catch { /* already gone */ }
  }

  channel = sb
    .channel(`inbox-watch-${myGen}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'claude_requests' }, (payload) => {
      if (myGen !== generation) return
      schedule(`new request ${payload.new?.id ?? '(unknown id)'}`)
    })
    .subscribe((status, err) => {
      if (myGen !== generation) return   // superseded channel - this is our own teardown

      if (status === 'SUBSCRIBED') {
        connectedAt = Date.now()
        log('connected - listening for new requests')
        catchUp('on connect')
        return
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        // Only a connection that actually held for a while counts as healthy;
        // otherwise a flapping link would keep resetting the backoff to 1s.
        if (connectedAt && Date.now() - connectedAt > HEALTHY_AFTER_MS) backoffMs = 1_000
        connectedAt = 0
        log(`realtime ${status.toLowerCase()}${err ? `: ${err.message}` : ''} - reconnecting in ${backoffMs / 1000}s`)
        reconnectTimer = setTimeout(connect, backoffMs)
        backoffMs = Math.min(backoffMs * 2, 60_000)
      }
    })
}

// A slow heartbeat doubles as a liveness marker in the log and as a floor on
// how long a missed event can sit unnoticed.
setInterval(() => catchUp('heartbeat'), 30 * 60 * 1000)

for (const sig of ['SIGINT', 'SIGTERM']) {
  // Only drop the lock if this process is the one holding it.
  process.on(sig, () => { log(`${sig} - shutting down`); if (running) releaseLock(); process.exit(0) })
}

log(`watching ${url} - repo ${root}${DRY_RUN ? ' (DRY RUN)' : ''}`)
connect()
