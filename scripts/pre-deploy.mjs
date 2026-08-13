#!/usr/bin/env node
/**
 * The pre-deploy gate. One command, one verdict.
 *
 * Exists because "did you run the tests?" is a question nobody should have to ask, and because the
 * two checks that actually bite - a stray console.log and a missing env var - are the two that
 * neither tsc nor vitest can see.
 *
 * Output is deliberately plain ASCII: it gets pasted into PR comments and CI logs, where ANSI
 * escapes render as garbage.
 *
 * Usage:
 *   node scripts/pre-deploy.mjs [--fix-hints] [--json]
 */

import { execSync } from 'node:child_process'
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, relative, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const args = new Set(process.argv.slice(2))
const WANT_HINTS = args.has('--fix-hints')
const AS_JSON = args.has('--json')

const SOURCE_ROOTS = ['apps/web/src', 'packages/core/src']
const SOURCE_EXTS = new Set(['.ts', '.tsx', '.mts', '.js', '.jsx'])

/** Debug leftovers. warn/error are deliberate signals and stay allowed. */
const BANNED_CONSOLE = /\bconsole\s*\.\s*(log|debug|dir|table|trace)\s*\(/

const results = []

function record(name, ok, detail, hint) {
  results.push({ name, ok, detail, hint })
  if (AS_JSON) return
  process.stdout.write(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}\n`)
  if (!ok && WANT_HINTS && hint) process.stdout.write(`        try: ${hint}\n`)
}

function runStep(name, command, hint) {
  try {
    execSync(command, { cwd: ROOT, stdio: 'pipe', encoding: 'utf8' })
    record(name, true)
    return true
  } catch (error) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim()
    const firstError =
      output
        .split('\n')
        .find((line) => /error|failed/i.test(line))
        ?.trim() ?? 'command exited non-zero'
    record(name, false, firstError.slice(0, 160), hint ?? command)
    return false
  }
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry === 'test') continue
      walk(full, out)
    } else if (SOURCE_EXTS.has(extname(entry))) {
      // Tests legitimately log while you are debugging them; they never ship.
      if (/\.(test|spec)\.[tj]sx?$/.test(entry)) continue
      if (/test-utils\.[tj]s$/.test(entry)) continue
      out.push(full)
    }
  }
  return out
}

function checkConsole() {
  const offenders = []
  for (const root of SOURCE_ROOTS) {
    for (const file of walk(join(ROOT, root))) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (line.includes('pre-deploy:allow-console')) return
          if (BANNED_CONSOLE.test(line)) offenders.push(`${relative(ROOT, file)}:${i + 1}`)
        })
    }
  }
  record(
    'No stray console.log',
    offenders.length === 0,
    offenders.length ? `${offenders.length} found: ${offenders.slice(0, 3).join(', ')}` : undefined,
    'remove them, or annotate the line with // pre-deploy:allow-console and justify it in the PR',
  )
  return offenders.length === 0
}

/** Names only - a value from .env.local is never read into memory, let alone printed. */
function namesIn(path) {
  if (!existsSync(path)) return []
  return readFileSync(path, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => line.split('=')[0].trim())
    .filter(Boolean)
}

function checkEnv() {
  const examplePath = join(ROOT, '.env.example')
  if (!existsSync(examplePath)) {
    record('Required env vars', true, '.env.example absent, nothing to verify')
    return true
  }

  const required = namesIn(examplePath)
  const local = new Set(namesIn(join(ROOT, '.env.local')))
  const missing = required.filter((name) => !process.env[name] && !local.has(name))

  record(
    'Required env vars',
    missing.length === 0,
    missing.length ? `missing: ${missing.join(', ')}` : `${required.length} present`,
    'cp .env.example .env.local and fill in the blanks',
  )
  return missing.length === 0
}

/**
 * Compares dependency maps rather than file mtimes: adding an npm script touches package.json
 * but legitimately leaves the lockfile alone, and a check that shouts about that gets ignored.
 */
function checkLockfile() {
  let changed
  try {
    changed = execSync('git diff --name-only HEAD', { cwd: ROOT, encoding: 'utf8' }).split('\n')
  } catch {
    record('Lockfile in sync', true, 'not a git checkout, skipped')
    return true
  }

  const manifests = changed.filter(
    (f) => f === 'package.json' || /^(apps|packages)\/[^/]+\/package\.json$/.test(f),
  )
  if (manifests.length === 0) {
    record('Lockfile in sync', true, 'no manifest changed')
    return true
  }

  const drifted = manifests.filter((file) => {
    const before = execSync(`git show HEAD:${file}`, { cwd: ROOT, encoding: 'utf8' })
    const after = readFileSync(join(ROOT, file), 'utf8')
    const deps = (raw) => {
      const parsed = JSON.parse(raw)
      return JSON.stringify([parsed.dependencies ?? {}, parsed.devDependencies ?? {}])
    }
    return deps(before) !== deps(after)
  })

  const ok = drifted.length === 0 || changed.includes('package-lock.json')
  record(
    'Lockfile in sync',
    ok,
    ok ? undefined : `${drifted.join(', ')} changed deps but package-lock.json did not`,
    'npm install && git add package-lock.json',
  )
  return ok
}

if (!AS_JSON) process.stdout.write('\nPre-deploy gate\n\n')

runStep('Typecheck', 'npm run typecheck')
runStep('Tests', 'npm test')
runStep('Build', 'npm run build')
checkConsole()
checkEnv()
checkLockfile()

const failed = results.filter((r) => !r.ok)

if (AS_JSON) {
  process.stdout.write(`${JSON.stringify({ ok: failed.length === 0, results }, null, 2)}\n`)
} else if (failed.length === 0) {
  process.stdout.write(`\nReady to deploy - ${results.length}/${results.length} checks passed\n\n`)
} else {
  process.stdout.write(
    `\nNot ready - ${failed.length} of ${results.length} checks failed: ${failed
      .map((f) => f.name)
      .join(', ')}\n\n`,
  )
}

process.exit(failed.length === 0 ? 0 : 1)
