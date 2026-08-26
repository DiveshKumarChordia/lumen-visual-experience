/**
 * Load a dotenv-style file chosen at runtime.
 *
 * Every script previously hardcoded `--env-file=.env` in package.json, which
 * made a second stack impossible without duplicating npm scripts. Node's
 * `--env-file` must precede the script path, so `npm run x -- --env-file=…`
 * cannot work; loading in-process is the only way to make the file a normal
 * argument.
 *
 *   npm run bootstrap                              -> .env
 *   npm run bootstrap -- --env .env.secondproject  -> that file
 *
 * Values already present in the real environment WIN, so CI (which injects
 * config directly and ships no dotenv file) is unaffected.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Strips optional surrounding quotes; keeps inner content verbatim. */
function parseValue(raw) {
  const v = raw.trim();
  if (
    (v.startsWith('"') && v.endsWith('"') && v.length > 1) ||
    (v.startsWith("'") && v.endsWith("'") && v.length > 1)
  ) {
    return v.slice(1, -1);
  }
  return v;
}

/**
 * @returns {{ file: string|null, loaded: string[] }}
 */
export function loadEnvFile(argv = process.argv.slice(2)) {
  const i = argv.findIndex((a) => a === '--env' || a === '--env-file');
  const explicit = i !== -1 ? argv[i + 1] : null;
  const candidate = explicit ?? '.env';
  const file = path.isAbsolute(candidate) ? candidate : path.join(ROOT, candidate);

  if (!fs.existsSync(file)) {
    // An explicit request for a missing file is an error; a missing default is
    // fine, because CI supplies configuration through the real environment.
    if (explicit) {
      throw new Error(`env file not found: ${file}`);
    }
    return { file: null, loaded: [] };
  }

  const loaded = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
    if (!m) continue;
    const [, key, rawValue] = m;
    if (process.env[key] !== undefined && process.env[key] !== '') continue;
    const value = parseValue(rawValue);
    if (value === '') continue;
    process.env[key] = value;
    loaded.push(key);
  }
  return { file, loaded };
}

/** Strip the consumed flag so downstream argv parsing is unaffected. */
export function stripEnvFlag(argv = process.argv.slice(2)) {
  const out = [...argv];
  const i = out.findIndex((a) => a === '--env' || a === '--env-file');
  if (i !== -1) out.splice(i, 2);
  return out;
}
