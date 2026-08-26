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
import { fileURLToPath } from 'node:url';

import { loadEnvFile } from './lib/env-file.mjs';
import { Cma } from './lib/cma.mjs';
import { resolveHosts } from './lib/hosts.mjs';
import { createLivePreviewTracker, createReleaseTracker } from './lib/tracker.mjs';
import { log } from './lib/logger.mjs';

// Must run before any config is read.
const { file: envFile } = loadEnvFile();

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

  log.banner('Preview API demo');
  log.value('cdn', env.VITE_CONTENTSTACK_API_HOST);
  log.value('rest-preview', env.VITE_CONTENTSTACK_PREVIEW_HOST);
  log.value('graphql-preview', env.VITE_CONTENTSTACK_GRAPHQL_PREVIEW_HOST);
  log.value('mode', JSON.stringify(previewMode()) === '{}' ? 'live' : JSON.stringify(previewMode()));
  log.value('draft header', flag('draft') ? 'true' : '(unset)');

  // A tracker is required before the preview products resolve the hash — and the
  // TYPE must match the kind of preview. `release_id` / `preview_timestamp` need
  // a `release` tracker, because only that builds the release plan the API
  // resolves against; a `livePreview` tracker returns 500 error_code 194.
  const wantsTimeline = Boolean(flag('release') || flag('timestamp'));

  log.step(wantsTimeline ? 'Create Release tracker' : 'Create Live Preview tracker');
  const cma = new Cma({ cmaBase: hosts.cmaBase, apiKey: env.VITE_CONTENTSTACK_API_KEY });
  await cma.login({
    email: process.env.CS_USER_EMAIL,
    password: process.env.CS_USER_PASSWORD,
    totpSecret: process.env.CS_USER_TOTP_SECRET || '',
    tfaToken: process.env.CS_USER_TFA_TOKEN || '',
  });

  let previewHash;
  try {
    const base = {
      previewHost: env.VITE_CONTENTSTACK_PREVIEW_HOST,
      apiKey: env.VITE_CONTENTSTACK_API_KEY,
      authtoken: cma.authtoken,
      branch: env.VITE_CONTENTSTACK_BRANCH,
    };

    let tracker;
    if (wantsTimeline) {
      const envs = await cma.environments();
      const target = envs.find((e) => e.name === env.VITE_CONTENTSTACK_ENVIRONMENT);
      if (!target) throw new Error(`No environment "${env.VITE_CONTENTSTACK_ENVIRONMENT}"`);

      // Pass each release's own scheduled_at so the plan is positioned in time.
      const schedules = {};
      for (const r of await cma.releases()) {
        const full = await cma.getRelease(r.uid);
        const st = Array.isArray(full?.status)
          ? full.status.find((x) => x.scheduled_at)
          : null;
        if (st?.scheduled_at) schedules[r.uid] = st.scheduled_at;
      }
      log.info(`${Object.keys(schedules).length} scheduled release(s) on the timeline`);
      if (!Object.keys(schedules).length) {
        log.warn('no scheduled releases — run `npm run seed:timeline` first');
      }

      tracker = await createReleaseTracker({ ...base, environmentUid: target.uid, schedules });
    } else {
      tracker = await createLivePreviewTracker(base);
    }

    previewHash = tracker.hash;
    if (!tracker.ok) {
      log.warn(`tracker not created (${tracker.status}): ${JSON.stringify(tracker.body).slice(0, 200)}`);
      log.info('preview reads may fall back to published content');
    } else {
      log.ok(tracker.body?.notice ?? 'tracker created');
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
