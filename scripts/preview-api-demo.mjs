#!/usr/bin/env node
/**
 * Exercises the three read products against the bootstrapped stack and prints a
 * comparison:
 *
 *   1. Content Delivery API   — cdn host,           delivery_token
 *   2. Preview REST API       — rest-preview host,  preview_token + live_preview
 *   3. GraphQL Preview API    — graphql-preview host, same auth, GraphQL shape
 *
 * The preview products only return preview content when a Live Preview tracker
 * exists for the hash, and creating one needs a CMA authtoken — so this logs in
 * the same way bootstrap.mjs does.
 *
 *   npm run preview:demo
 *   npm run preview:demo -- --release <uid>
 *   npm run preview:demo -- --timestamp 2026-09-01T00:00:00.000Z
 *   npm run preview:demo -- --draft            # x-cs-preview-enable-entry-draft
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { Cma } from './lib/cma.mjs';
import { resolveHosts } from './lib/hosts.mjs';
import { log } from './lib/logger.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? undefined : (argv[i + 1] ?? true);
};

/** .env.local is written by bootstrap.mjs and holds the tokens. */
function loadEnvLocal() {
  const p = path.join(ROOT, '.env.local');
  if (!fs.existsSync(p)) {
    log.err('.env.local not found — run `npm run bootstrap` first.');
    process.exit(1);
  }
  const out = {};
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

/** Tracker hashes are opaque; shape mirrors the e2e helper. */
const makePreviewHash = () =>
  `${crypto.randomBytes(10).toString('hex')}${Date.now().toString(36)}`;

function previewMode() {
  if (flag('release')) return { release_id: String(flag('release')) };
  if (flag('timestamp')) return { preview_timestamp: String(flag('timestamp')) };
  return {};
}

async function readJson(res) {
  const text = await res.text();
  try { return text ? JSON.parse(text) : {}; } catch { return { raw: text }; }
}

// ------------------------------------------------------------------ products

async function viaDeliveryApi(env, ct) {
  const url = new URL(`https://${env.VITE_CONTENTSTACK_API_HOST}/v3/content_types/${ct}/entries`);
  url.searchParams.set('environment', env.VITE_CONTENTSTACK_ENVIRONMENT);
  url.searchParams.set('locale', env.VITE_CONTENTSTACK_LOCALE);

  const res = await fetch(url, {
    headers: {
      api_key: env.VITE_CONTENTSTACK_API_KEY,
      access_token: env.VITE_CONTENTSTACK_DELIVERY_TOKEN,
      branch: env.VITE_CONTENTSTACK_BRANCH,
    },
  });
  const body = await readJson(res);
  if (!res.ok) throw new Error(`CDA ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
  return body.entries ?? [];
}

async function viaPreviewRest(env, ct, previewHash) {
  const url = new URL(`https://${env.VITE_CONTENTSTACK_PREVIEW_HOST}/v3/content_types/${ct}/entries`);
  url.searchParams.set('locale', env.VITE_CONTENTSTACK_LOCALE);
  url.searchParams.set('include_count', 'true');

  const headers = {
    api_key: env.VITE_CONTENTSTACK_API_KEY,
    preview_token: env.VITE_CONTENTSTACK_PREVIEW_TOKEN,
    environment: env.VITE_CONTENTSTACK_ENVIRONMENT,
    branch: env.VITE_CONTENTSTACK_BRANCH,
    live_preview: previewHash,
    ...previewMode(),
  };
  if (flag('draft')) headers['x-cs-preview-enable-entry-draft'] = 'true';

  const res = await fetch(url, { headers });
  const body = await readJson(res);
  if (!res.ok) throw new Error(`Preview REST ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  return body.entries ?? [];
}

async function viaGraphqlPreview(env, previewHash) {
  const url = `https://${env.VITE_CONTENTSTACK_GRAPHQL_PREVIEW_HOST}/stacks/${env.VITE_CONTENTSTACK_API_KEY}`;

  const headers = {
    'Content-Type': 'application/json',
    api_key: env.VITE_CONTENTSTACK_API_KEY,
    preview_token: env.VITE_CONTENTSTACK_PREVIEW_TOKEN,
    environment: env.VITE_CONTENTSTACK_ENVIRONMENT,
    branch: env.VITE_CONTENTSTACK_BRANCH,
    live_preview: previewHash,
    ...previewMode(),
  };
  if (flag('draft')) headers['x-cs-preview-enable-entry-draft'] = 'true';

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      query: `query { all_page { items { title url system { uid } } } }`,
      variables: {},
    }),
  });
  const body = await readJson(res);
  if (body.errors?.length) {
    throw new Error(`GraphQL: ${body.errors.map((e) => e.message ?? JSON.stringify(e)).join('; ')}`);
  }
  if (!res.ok) throw new Error(`GraphQL ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  return body.data?.all_page?.items ?? [];
}

// ---------------------------------------------------------------------- main

async function main() {
  const env = loadEnvLocal();
  const hosts = resolveHosts(process.env);
  const previewHash = makePreviewHash();

  log.banner('Preview API demo');
  log.value('cdn', env.VITE_CONTENTSTACK_API_HOST);
  log.value('rest-preview', env.VITE_CONTENTSTACK_PREVIEW_HOST);
  log.value('graphql-preview', env.VITE_CONTENTSTACK_GRAPHQL_PREVIEW_HOST);
  log.value('mode', JSON.stringify(previewMode()) === '{}' ? 'live' : JSON.stringify(previewMode()));
  log.value('draft header', flag('draft') ? 'true' : '(unset)');

  // A tracker is required before the preview products will resolve the hash.
  log.step('Create Live Preview tracker');
  const cma = new Cma({ cmaBase: hosts.cmaBase, apiKey: env.VITE_CONTENTSTACK_API_KEY });
  await cma.login({
    email: process.env.CS_USER_EMAIL,
    password: process.env.CS_USER_PASSWORD,
    totpSecret: process.env.CS_USER_TOTP_SECRET || '',
    tfaToken: process.env.CS_USER_TFA_TOKEN || '',
  });

  try {
    const res = await fetch(`https://${env.VITE_CONTENTSTACK_PREVIEW_HOST}/v3/live-preview/tracker`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        api_key: env.VITE_CONTENTSTACK_API_KEY,
        authtoken: cma.authtoken,
        live_preview: previewHash,
        branch: env.VITE_CONTENTSTACK_BRANCH,
      },
      body: JSON.stringify({ type: 'livePreview' }),
    });
    const body = await readJson(res);
    if (res.status !== 201) {
      log.warn(`tracker not created (${res.status}): ${JSON.stringify(body).slice(0, 220)}`);
      log.info('preview reads may fall back to published content');
    } else {
      log.ok(body.notice ?? 'tracker created');
    }

    log.step('Read the same content three ways');
    const results = await Promise.allSettled([
      viaDeliveryApi(env, 'page'),
      viaPreviewRest(env, 'page', previewHash),
      viaGraphqlPreview(env, previewHash),
    ]);

    const labels = ['Content Delivery API', 'Preview REST API', 'GraphQL Preview API'];
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        log.err(`${labels[i]}: ${r.reason.message}`);
        return;
      }
      const items = r.value;
      log.ok(`${labels[i]} -> ${items.length} page(s)`);
      items.forEach((e) => log.info(`    ${e.title} — ${e.url}`));
    });
  } finally {
    await cma.logout();
  }
}

main().catch((err) => {
  log.err(err?.message || String(err));
  process.exit(1);
});
