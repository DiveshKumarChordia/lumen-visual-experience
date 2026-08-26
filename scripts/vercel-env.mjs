#!/usr/bin/env node
/**
 * Print the VITE_* values from .env.local as Vercel CLI commands.
 *
 *   npm run vercel:env            # printable commands
 *   npm run vercel:env -- --apply # actually run them (needs vercel CLI + auth)
 *
 * These are build-time values baked into the client bundle, so they must exist
 * on Vercel before the build, not at runtime.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { log } from './lib/logger.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');
const envFile = path.join(ROOT, '.env.local');

/**
 * Vercel defaults `env add` to secret visibility and then REFUSES it for
 * framework-public prefixes:
 *   "Environment variables with a public framework prefix (VITE) cannot use
 *    secret visibility on Production or Preview."
 * These values are compiled into the client bundle, so they are public by
 * construction — declare that explicitly rather than pretending otherwise.
 */
const VISIBILITY_FLAGS = ['--visibility', 'config', '--no-sensitive'];

if (!fs.existsSync(envFile)) {
  log.err('.env.local not found — run `npm run bootstrap` first.');
  process.exit(1);
}

const vars = fs
  .readFileSync(envFile, 'utf8')
  .split('\n')
  .map((l) => l.match(/^(VITE_[A-Z0-9_]+)=(.*)$/))
  .filter(Boolean)
  .map((m) => [m[1], m[2].trim()])
  .filter(([, v]) => v !== '');

if (!vars.length) {
  log.err('No VITE_* values found in .env.local');
  process.exit(1);
}

log.banner(`${vars.length} build-time variables`);

for (const [key, value] of vars) {
  if (!APPLY) {
    // printf avoids the interactive prompt `vercel env add` would otherwise show.
    console.log(
      `printf %s ${JSON.stringify(value)} | vercel env add ${key} production ${VISIBILITY_FLAGS.join(' ')}`,
    );
    continue;
  }
  for (const target of ['production', 'preview']) {
    try {
      execFileSync('vercel', ['env', 'add', key, target, ...VISIBILITY_FLAGS], {
        input: value,
        stdio: ['pipe', 'ignore', 'pipe'],
      });
      log.ok(`${key} -> ${target}`);
    } catch (err) {
      const msg = String(err.stderr ?? err.stdout ?? err.message);
      if (/already exists/i.test(msg)) log.skip(`${key} -> ${target} (exists)`);
      else log.warn(`${key} -> ${target}: ${msg.replace(/\s+/g, ' ').slice(0, 160)}`);
    }
  }
}

if (!APPLY) {
  console.log('');
  log.info('Pipe these into a shell, or re-run with --apply to set them directly.');
  log.warn('These values end up in the client bundle — see the README note on the preview token.');
}
