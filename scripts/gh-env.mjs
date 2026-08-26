#!/usr/bin/env node
/**
 * Register the current local config as a GitHub Environment.
 *
 *   npm run gh:env -- <environment-name> [--repo owner/name] [--dry-run]
 *
 * Reads `.env` (credentials, stack selection) and `.env.local` (tokens derived
 * by the bootstrap), then creates the GitHub Environment and populates it.
 *
 * Split is deliberate:
 *   variables — non-secret, and visible in build logs (hosts, api key, locale)
 *   secrets   — password, TOTP secret, delivery + preview tokens
 *
 * The delivery and preview tokens end up in the client bundle regardless, but
 * keeping them out of git and out of logs is still worth doing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveHosts } from './lib/hosts.mjs';
import { log } from './lib/logger.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const envName = argv.find((a) => !a.startsWith('--'));
const repoFlag = argv.indexOf('--repo');
const repo = repoFlag !== -1 ? argv[repoFlag + 1] : null;

if (!envName) {
  log.err('Usage: npm run gh:env -- <environment-name> [--repo owner/name]');
  process.exit(1);
}

function readEnvFile(name) {
  const p = path.join(ROOT, name);
  if (!fs.existsSync(p)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(p, 'utf8')
      .split('\n')
      .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2].trim()]),
  );
}

const dotenv = readEnvFile('.env');
const local = readEnvFile('.env.local');
const hosts = resolveHosts(dotenv);

/**
 * @param args        argv for `gh`
 * @param opts.input  value piped on stdin — used for secrets so they never
 *                    appear in argv (visible via `ps`) or in a dry-run echo
 * @param opts.secret redact the piped value when printing
 */
function gh(args, { input, secret = false } = {}) {
  if (DRY) {
    const shown = input === undefined ? '' : ` <<< ${secret ? '<redacted>' : JSON.stringify(input)}`;
    console.log(`  gh ${args.join(' ')}${shown}`);
    return '';
  }
  return execFileSync('gh', args, {
    input,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

const repoArgs = repo ? ['--repo', repo] : [];

/** Non-secret configuration. Visible in logs — nothing sensitive here. */
const variables = {
  CS_INSTANCE: dotenv.CS_INSTANCE ?? '',
  CS_STACK_API_KEY: local.VITE_CONTENTSTACK_API_KEY ?? dotenv.CS_STACK_API_KEY ?? '',
  CS_STACK_NAME: dotenv.CS_STACK_NAME ?? '',
  CS_ENVIRONMENT: local.VITE_CONTENTSTACK_ENVIRONMENT ?? dotenv.CS_ENVIRONMENT ?? '',
  CS_BRANCH: local.VITE_CONTENTSTACK_BRANCH ?? dotenv.CS_BRANCH ?? 'main',
  CS_LOCALE: local.VITE_CONTENTSTACK_LOCALE ?? dotenv.CS_LOCALE ?? 'en-us',
  CS_USER_EMAIL: dotenv.CS_USER_EMAIL ?? '',
  CS_CDN_HOST: local.VITE_CONTENTSTACK_API_HOST ?? hosts.cdnHost,
  CS_APP_URL: local.VITE_CONTENTSTACK_APP_HOST ?? hosts.appUrl,
  CS_PREVIEW_HOST: local.VITE_CONTENTSTACK_PREVIEW_HOST ?? hosts.previewHost,
  CS_GRAPHQL_PREVIEW_HOST:
    local.VITE_CONTENTSTACK_GRAPHQL_PREVIEW_HOST ?? hosts.graphqlPreviewHost,
  // Set once the stack has its own stable deployment URL.
  CS_PUBLIC_URL: '',
  // Opt in per environment: repoint Contentstack after each deploy.
  CS_SYNC_SITE_URL: 'false',
};

const secrets = {
  CS_USER_PASSWORD: dotenv.CS_USER_PASSWORD ?? '',
  CS_USER_TOTP_SECRET: dotenv.CS_USER_TOTP_SECRET ?? '',
  CS_DELIVERY_TOKEN: local.VITE_CONTENTSTACK_DELIVERY_TOKEN ?? '',
  CS_PREVIEW_TOKEN: local.VITE_CONTENTSTACK_PREVIEW_TOKEN ?? '',
};

async function main() {
  log.banner(`GitHub Environment: ${envName}${DRY ? ' (dry run)' : ''}`);

  log.step('Create environment');
  const owner = repo ?? gh(['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner']).trim();
  gh(['api', '-X', 'PUT', `repos/${owner}/environments/${envName}`, '--silent']);
  log.ok(owner ? `${owner} -> ${envName}` : envName);

  log.step('Variables');
  for (const [key, value] of Object.entries(variables)) {
    if (!value) {
      log.skip(`${key} (empty — set it later)`);
      continue;
    }
    // Variables are non-secret, so the value is fine to show.
    gh(['variable', 'set', key, '--env', envName, ...repoArgs], { input: value });
    log.ok(`${key} = ${value}`);
  }

  log.step('Secrets');
  for (const [key, value] of Object.entries(secrets)) {
    if (!value) {
      log.warn(`${key} is empty — the workflow will fail without it`);
      continue;
    }
    // stdin, never argv: `--body` would expose the value to `ps`.
    gh(['secret', 'set', key, '--env', envName, ...repoArgs], { input: value, secret: true });
    log.ok(`${key} set (${value.length} chars, value not printed)`);
  }

  log.step('Vercel wiring');
  log.info('These are per-stack and must be set by hand (one Vercel project each):');
  log.info(`  gh variable set VERCEL_ORG_ID     --env ${envName} --body <team_...>`);
  log.info(`  gh variable set VERCEL_PROJECT_ID --env ${envName} --body <prj_...>`);
  log.info(`  gh secret   set VERCEL_TOKEN      --env ${envName} --body <token>`);

  log.banner('Next');
  console.log(`
  Add "${envName}" to the matrix:

    gh variable set DEPLOY_ENVIRONMENTS --body '["${envName}"]'

  (include every environment you want deployed in parallel)
`);
}

main().catch((err) => {
  const msg = String(err.stderr ?? err.message);
  log.err(msg.split('\n').slice(0, 3).join(' '));
  process.exit(1);
});
