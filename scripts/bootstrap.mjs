#!/usr/bin/env node
/**
 * One-command bootstrap.
 *
 *   npm run bootstrap
 *
 * Idempotent: every step checks for the resource first, so re-running converges
 * on the same stack instead of duplicating content. Re-runnable output is marked
 * `=` (already existed) vs `+` (created).
 *
 * Steps
 *   1  login (email + password, TOTP if the account requires it)
 *   2  resolve organization
 *   3  resolve or create the stack
 *   4  resolve or create the environment, pointing at the local dev server
 *   5  create delivery token + preview token
 *   6  enable Live Preview on the stack
 *   7  create content types
 *   8  create entries (blog posts first, so pages can reference them)
 *   9  publish everything
 *  10  write .env.local for the Vite app
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadEnvFile } from './lib/env-file.mjs';
import { Cma, CmaError } from './lib/cma.mjs';
import { resolveHosts } from './lib/hosts.mjs';
import { log } from './lib/logger.mjs';
import {
  CONTENT_TYPES,
  CONTENT_TYPE_ORDER,
  GLOBAL_FIELDS,
  TAXONOMIES,
} from './lib/model.mjs';
import { AUTHORS, BLOG_POSTS, FOOTER, HEADER, PAGES } from './lib/seed.mjs';
import { ASSETS, resolveAssetRefs } from './lib/assets.mjs';

// Must run before any config is read.
const { file: envFile } = loadEnvFile();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const SKIP_PUBLISH = has('--skip-publish');

// ------------------------------------------------------------------- config

function config() {
  const env = process.env;
  const missing = [];
  const need = (k) => {
    const v = (env[k] || '').trim();
    if (!v) missing.push(k);
    return v;
  };

  const cfg = {
    email: need('CS_USER_EMAIL'),
    password: need('CS_USER_PASSWORD'),
    totpSecret: (env.CS_USER_TOTP_SECRET || '').trim(),
    // One-shot 6-digit code, for accounts with 2FA but no shared secret to hand.
    tfaToken: (env.CS_USER_TFA_TOKEN || '').trim(),

    orgName: (env.CS_ORG_NAME || '').trim(),
    orgUid: (env.CS_ORG_UID || '').trim(),

    stackName: (env.CS_STACK_NAME || 'Lumen Visual Experience').trim(),
    stackApiKey: (env.CS_STACK_API_KEY || '').trim(),

    envName: (env.CS_ENVIRONMENT || 'development').trim(),
    branch: (env.CS_BRANCH || 'main').trim(),
    locale: (env.CS_LOCALE || 'en-us').trim(),

    // Where Visual Builder should load the site from.
    siteUrl: (env.CS_SITE_URL || 'http://localhost:3000').replace(/\/+$/, ''),

    hosts: resolveHosts(env),
  };

  if (missing.length) {
    log.err(`Missing required env vars: ${missing.join(', ')}`);
    log.info('Copy .env.example to .env and fill it in, then re-run.');
    process.exit(1);
  }
  return cfg;
}

// -------------------------------------------------------------------- steps

/**
 * Resolve the organization, and — when a stack api key is also given — verify the
 * stack actually belongs to it.
 *
 * Previously this returned early whenever CS_STACK_API_KEY was set, which meant
 * an org named in config was silently ignored: the run just used whichever org
 * owned that key. With several orgs on one account (and a stack name reused
 * between them) that is how you bootstrap the wrong stack. If both are supplied
 * they must agree.
 */
async function resolveOrg(cma, cfg) {
  log.step('Resolve organization');

  const orgs = await cma.organizations();
  if (!orgs.length) throw new Error('This account belongs to no organizations.');

  let org = null;

  if (cfg.orgUid) {
    org = orgs.find((o) => o.uid === cfg.orgUid) ?? null;
    if (!org) {
      throw new Error(
        `No organization with uid "${cfg.orgUid}" on this account. ` +
          `Available: ${orgs.map((o) => `${o.name} (${o.uid})`).join(', ')}`,
      );
    }
  } else if (cfg.orgName) {
    // Names can carry stray whitespace when copied from the UI.
    const want = cfg.orgName.trim().toLowerCase();
    org = orgs.find((o) => (o.name ?? '').trim().toLowerCase() === want) ?? null;
    if (!org) {
      throw new Error(
        `No organization named "${cfg.orgName}". ` +
          `Available: ${orgs.map((o) => o.name).join(', ')}`,
      );
    }
  }

  if (org) {
    // Both given: cross-check so a copy/paste mismatch fails loudly.
    if (cfg.orgUid && cfg.orgName) {
      const nameMatches =
        (org.name ?? '').trim().toLowerCase() === cfg.orgName.trim().toLowerCase();
      if (!nameMatches) {
        throw new Error(
          `CS_ORG_UID (${cfg.orgUid} -> "${org.name}") and CS_ORG_NAME ` +
            `("${cfg.orgName}") disagree. Fix one of them.`,
        );
      }
    }
    log.ok(`${org.name}`);
    log.value('organization_uid', org.uid);
    return org.uid;
  }

  // Neither supplied.
  if (cfg.stackApiKey) {
    log.skip('no org configured; using the stack api key alone');
    return '';
  }
  const first = orgs[0];
  if (orgs.length > 1) {
    log.warn(`${orgs.length} organizations found, using the first. Set CS_ORG_NAME or CS_ORG_UID.`);
    orgs.forEach((o) => log.info(`  - ${o.name} (${o.uid})`));
  }
  log.ok(`${first.name}`);
  log.value('organization_uid', first.uid);
  return first.uid;
}

/**
 * Confirm the stack api key belongs to the resolved org before anything is
 * written. Cheap, and it turns "wrong org" from silent data corruption into a
 * clear failure.
 */
async function verifyStackInOrg(cma, cfg, orgUid) {
  if (!orgUid || !cfg.stackApiKey) return;

  log.step('Verify stack belongs to the organization');
  const stacks = await cma.stacks({ orgUid });
  const match = stacks.find((st) => st.api_key === cfg.stackApiKey);

  if (!match) {
    throw new Error(
      `Stack ${cfg.stackApiKey} is not in organization ${orgUid}. ` +
        `Stacks there: ${stacks.map((st) => `${st.name} (${st.api_key})`).join(', ') || '(none visible)'}`,
    );
  }
  log.ok(`"${(match.name ?? '').trim()}" is in this org`);
}

async function resolveStack(cma, cfg, orgUid) {
  log.step('Resolve stack');

  if (cfg.stackApiKey) {
    cma.apiKey = cfg.stackApiKey;
    const stack = await cma.stack();
    if (!stack) throw new Error(`No stack readable for CS_STACK_API_KEY=${cfg.stackApiKey}`);
    log.skip(`using existing stack "${stack.name}"`);
    log.value('api_key', stack.api_key);
    return stack;
  }

  const stacks = await cma.stacks({ orgUid });
  const existing = stacks.find((s) => s.name === cfg.stackName);
  if (existing) {
    cma.apiKey = existing.api_key;
    log.skip(`stack "${cfg.stackName}" already exists`);
    log.value('api_key', existing.api_key);
    return existing;
  }

  const created = await cma.createStack({
    name: cfg.stackName,
    description: 'Website built with Contentstack Visual Experience (Live Preview + Visual Builder).',
    masterLocale: cfg.locale,
    orgUid,
  });
  cma.apiKey = created.api_key;
  log.ok(`created stack "${created.name}"`);
  log.value('api_key', created.api_key);
  return created;
}

async function resolveEnvironment(cma, cfg) {
  log.step('Resolve environment');
  const urls = [{ locale: cfg.locale, url: cfg.siteUrl }];

  const envs = await cma.environments();
  const existing = envs.find((e) => e.name === cfg.envName);

  if (existing) {
    const current = existing.urls?.find((u) => u.locale === cfg.locale)?.url;
    if (current !== cfg.siteUrl) {
      await cma.updateEnvironment(cfg.envName, { urls });
      log.ok(`environment "${cfg.envName}" base URL -> ${cfg.siteUrl}`);
    } else {
      log.skip(`environment "${cfg.envName}" already points at ${cfg.siteUrl}`);
    }
    return existing;
  }

  const created = await cma.createEnvironment({ name: cfg.envName, urls });
  log.ok(`created environment "${cfg.envName}" -> ${cfg.siteUrl}`);
  return created;
}

/**
 * The preview token is only returned at creation time, so if a token with our
 * name exists but we have no stored preview token we create a fresh one rather
 * than silently producing a site that cannot read drafts.
 */
async function resolveTokens(cma, cfg) {
  log.step('Delivery + preview token');
  const name = `visual-experience-${cfg.envName}`;

  const tokens = await cma.deliveryTokens();
  const existing = tokens.find((t) => t.name === name);

  if (existing?.preview_token) {
    log.skip(`token "${name}" already exists (with preview token)`);
    return { deliveryToken: existing.token, previewToken: existing.preview_token };
  }

  // A delivery token exists but carries no preview token — typically because it
  // was created before Live Preview was enabled on the stack. Mint one for it
  // rather than piling up duplicate delivery tokens on every re-run.
  if (existing) {
    log.info(`token "${name}" exists without a preview token, minting one`);
    let { conflict, planGated, previewToken } = await cma.createPreviewTokenFor(existing.uid);

    if (conflict) {
      if (planGated) {
        log.warn('Preview Token is not included in this stack\'s plan (error 600)');
        return { deliveryToken: existing.token, previewToken: '' };
      }
      // The API says one exists but the list did not expose it; replace it.
      log.warn('preview token already associated but not readable — recreating');
      await cma.deletePreviewTokenFor(existing.uid);
      ({ previewToken } = await cma.createPreviewTokenFor(existing.uid));
    }

    if (previewToken) {
      log.ok(`minted preview token for "${name}"`);
      return { deliveryToken: existing.token, previewToken };
    }
    log.warn('could not mint a preview token for the existing delivery token');
  }

  let created = null;
  if (!existing) {
    created = await cma.createDeliveryToken({
      name,
      description: 'Created by bootstrap.mjs for Live Preview / Visual Builder.',
      environments: [cfg.envName],
    });
  }

  if (created?.preview_token) {
    log.ok(`created delivery token "${name}" + preview token`);
    return { deliveryToken: created.token, previewToken: created.preview_token };
  }

  // Last resort: the create call did not return one, so ask explicitly.
  if (created?.uid) {
    const { previewToken } = await cma.createPreviewTokenFor(created.uid);
    if (previewToken) {
      log.ok(`created delivery token "${name}", minted preview token separately`);
      return { deliveryToken: created.token, previewToken };
    }
  }

  log.warn('no preview token available — continuing without draft preview');
  log.info('the site will read published content from the CDA; Visual Builder');
  log.info('overlays and editing still work, but unsaved drafts will not render');
  return { deliveryToken: existing?.token ?? created?.token ?? '', previewToken: '' };
}

/**
 * stack.settings.live_preview — keys per
 * visual-builder/src/types/stores/auth.ts
 */
async function enableLivePreview(cma, cfg) {
  log.step('Enable Live Preview on the stack');
  await cma.updateStackSettings({
    live_preview: {
      enabled: true,
      'default-env': cfg.envName,
      'default-locale': cfg.locale,
      'default-url': cfg.siteUrl,
    },
  });
  log.ok(`live preview enabled (env=${cfg.envName}, url=${cfg.siteUrl})`);
}

/**
 * Taxonomies must exist before any content type carrying a taxonomy field: the
 * CMA validates `taxonomy_uid` on save.
 */
async function ensureTaxonomies(cma) {
  log.step('Taxonomies');
  const existing = await cma.taxonomies();
  const byUid = new Set(existing.map((t) => t.uid));

  for (const tax of TAXONOMIES) {
    if (byUid.has(tax.uid)) {
      log.skip(`${tax.uid}`);
    } else {
      await cma.createTaxonomy({ uid: tax.uid, name: tax.name, description: tax.description });
      log.ok(`created taxonomy ${tax.uid}`);
    }

    const haveTerms = new Set((await cma.terms(tax.uid)).map((t) => t.uid));
    // Parents first, so `parent_uid` always resolves.
    const ordered = [...tax.terms].sort((a, b) => (a.parent_uid ? 1 : 0) - (b.parent_uid ? 1 : 0));
    let added = 0;
    for (const term of ordered) {
      if (haveTerms.has(term.uid)) continue;
      try {
        // `order` is scoped to siblings, so a global index is rejected. Omit it
        // and let the API append.
        await cma.createTerm(tax.uid, term);
        added += 1;
        haveTerms.add(term.uid);
      } catch (err) {
        log.warn(`term ${tax.uid}/${term.uid}: ${err.message}`);
      }
    }
    if (added) log.ok(`  ${tax.uid}: +${added} term(s)`);
    else log.skip(`  ${tax.uid}: ${tax.terms.length} term(s) already present`);
  }
}

/** Global fields must exist before content types referencing them. */
async function ensureGlobalFields(cma) {
  log.step('Global fields');
  const existing = await cma.globalFields();
  const byUid = new Set(existing.map((g) => g.uid));

  for (const gf of GLOBAL_FIELDS) {
    if (byUid.has(gf.uid)) {
      try {
        await cma.updateGlobalField(gf.uid, gf);
        log.skip(`${gf.uid} (schema synced)`);
      } catch (err) {
        log.warn(`${gf.uid} exists; sync failed: ${err.message}`);
      }
      continue;
    }
    await cma.createGlobalField(gf);
    log.ok(`created global field ${gf.uid}`);
  }
}

async function ensureContentTypes(cma) {
  log.step('Content types');
  const existing = await cma.contentTypes();
  const byUid = new Map(existing.map((c) => [c.uid, c]));

  for (const uid of CONTENT_TYPE_ORDER) {
    const def = CONTENT_TYPES.find((c) => c.uid === uid);
    if (!def) continue;

    if (byUid.has(uid)) {
      // Keep the schema current so model edits land on re-run.
      try {
        await cma.updateContentType(uid, def);
        log.skip(`${uid} (schema synced)`);
      } catch (err) {
        log.warn(`${uid} exists; schema sync failed: ${err.message}`);
      }
      continue;
    }
    await cma.createContentType(def);
    log.ok(`created ${uid}`);
  }
}

/**
 * Upload and publish the generated SVG assets, returning key -> uid.
 *
 * Matched on title for idempotency. Assets are published to the environment so
 * the delivery API serves their URLs; an unpublished asset resolves to null on
 * the CDA even when the entry references it.
 */
async function ensureAssets(cma, cfg) {
  log.step('Assets');
  const existing = await cma.assets({ limit: 200 });
  const uidByTitle = new Map(existing.map((a) => [a.title, a.uid]));
  const uidByKey = new Map();
  const freshlyUploaded = [];

  for (const asset of ASSETS) {
    const found = uidByTitle.get(asset.title);
    if (found) {
      uidByKey.set(asset.key, found);
      log.skip(`${asset.filename}`);
      continue;
    }
    try {
      const created = await cma.uploadAsset({
        buffer: Buffer.from(asset.svg, 'utf8'),
        filename: asset.filename,
        contentType: 'image/svg+xml',
        title: asset.title,
        description: 'Generated by bootstrap.mjs',
      });
      if (created?.uid) {
        uidByKey.set(asset.key, created.uid);
        freshlyUploaded.push(created.uid);
        log.ok(`uploaded ${asset.filename}`);
      }
    } catch (err) {
      log.warn(`${asset.filename}: ${err.message}`);
    }
  }

  let published = 0;
  for (const uid of freshlyUploaded) {
    try {
      await cma.publishAsset(uid, { environments: [cfg.envName], locales: [cfg.locale] });
      published += 1;
    } catch (err) {
      log.warn(`publish asset ${uid}: ${err.message}`);
    }
  }
  if (published) log.ok(`published ${published} asset(s) to "${cfg.envName}"`);

  return uidByKey;
}

/** Find an entry by a field value, for idempotent creation. */
async function findEntry(cma, ctUid, field, value, locale) {
  const entries = await cma.entries(ctUid, { query: { [field]: value }, locale });
  return entries[0] || null;
}

async function ensureSingleton(cma, ctUid, fields, cfg) {
  const existing = await findEntry(cma, ctUid, 'title', fields.title, cfg.locale);
  if (existing) {
    await cma.updateEntry(ctUid, existing.uid, fields, { locale: cfg.locale });
    log.skip(`${ctUid} "${fields.title}" (updated)`);
    return existing.uid;
  }
  const created = await cma.createEntry(ctUid, fields, { locale: cfg.locale });
  log.ok(`created ${ctUid} "${fields.title}"`);
  return created.uid;
}

async function ensureEntries(cma, cfg, assetUids) {
  log.step('Entries');
  // Swap every `__ASSET__:<key>` placeholder for the uploaded asset uid.
  const withAssets = (obj) => resolveAssetRefs(obj, assetUids);
  const created = { header: null, footer: null, authors: [], posts: [], pages: [] };

  created.header = await ensureSingleton(cma, 'header', withAssets(HEADER), cfg);
  created.footer = await ensureSingleton(cma, 'footer', withAssets(FOOTER), cfg);

  // Authors first — blog posts reference them.
  const authorUidByName = new Map();
  for (const author of AUTHORS) {
    const uid = await ensureSingleton(cma, 'author', withAssets(author), cfg);
    authorUidByName.set(author.title, uid);
    created.authors.push({ uid, name: author.title });
  }

  // Blog posts next — pages reference them via `latest_posts.posts`.
  for (const post of BLOG_POSTS) {
    // `authorName` is a seed-only key; swap it for a real reference value.
    const { authorName, ...rest } = withAssets(post);
    const authorUid = authorUidByName.get(authorName);
    const fields = {
      ...rest,
      author: authorUid ? [{ uid: authorUid, _content_type_uid: 'author' }] : [],
    };

    const existing = await findEntry(cma, 'blog_post', 'url', post.url, cfg.locale);
    if (existing) {
      await cma.updateEntry('blog_post', existing.uid, fields, { locale: cfg.locale });
      log.skip(`blog_post ${post.url} (updated)`);
      created.posts.push({ uid: existing.uid, url: post.url });
    } else {
      const e = await cma.createEntry('blog_post', fields, { locale: cfg.locale });
      log.ok(`created blog_post ${post.url}`);
      created.posts.push({ uid: e.uid, url: post.url });
    }
  }

  const postRefs = created.posts.slice(0, 3).map((p) => ({
    uid: p.uid,
    _content_type_uid: 'blog_post',
  }));

  for (const rawPage of PAGES) {
    const page = withAssets(rawPage);
    const fields = {
      ...page,
      page_components: page.page_components.map((block) =>
        block.latest_posts
          ? { latest_posts: { ...block.latest_posts, posts: postRefs } }
          : block,
      ),
    };

    const existing = await findEntry(cma, 'page', 'url', page.url, cfg.locale);
    if (existing) {
      await cma.updateEntry('page', existing.uid, fields, { locale: cfg.locale });
      log.skip(`page ${page.url} (updated)`);
      created.pages.push({ uid: existing.uid, url: page.url });
    } else {
      const e = await cma.createEntry('page', fields, { locale: cfg.locale });
      log.ok(`created page ${page.url}`);
      created.pages.push({ uid: e.uid, url: page.url });
    }
  }

  return created;
}

async function publishAll(cma, cfg, entries) {
  log.step('Publish');
  if (SKIP_PUBLISH) {
    log.skip('--skip-publish given');
    return;
  }

  const targets = [
    ['header', entries.header],
    ['footer', entries.footer],
    ...entries.authors.map((a) => ['author', a.uid]),
    ...entries.posts.map((p) => ['blog_post', p.uid]),
    ...entries.pages.map((p) => ['page', p.uid]),
  ].filter(([, uid]) => Boolean(uid));

  let ok = 0;
  for (const [ctUid, entryUid] of targets) {
    try {
      await cma.publishEntry(ctUid, entryUid, {
        environments: [cfg.envName],
        locales: [cfg.locale],
      });
      ok += 1;
    } catch (err) {
      log.warn(`publish ${ctUid}/${entryUid} failed: ${err.message}`);
    }
  }
  log.ok(`queued ${ok}/${targets.length} entries for publish to "${cfg.envName}"`);
}

/**
 * Publishing is asynchronous: the publish call returns 201 ("queued"), not
 * "live". Poll the delivery API until content actually appears, so a green run
 * means the site will really render.
 *
 * The CDN caches per URL, including empty responses — a read issued before the
 * queue drains can pin an empty result for minutes. Every probe therefore
 * carries a unique cache-buster.
 */
async function verifyPublished(cfg, tokens, expected) {
  log.step('Verify published content');
  const { hosts } = cfg;

  const probe = async (ctUid) => {
    const url = new URL(`${hosts.cdnBase}/content_types/${ctUid}/entries`);
    url.searchParams.set('environment', cfg.envName);
    url.searchParams.set('locale', cfg.locale);
    url.searchParams.set('_cb', `${Date.now()}-${Math.random().toString(36).slice(2)}`);

    const res = await fetch(url, {
      headers: { api_key: cfg.stackApiKeyResolved, access_token: tokens.deliveryToken },
    });
    if (!res.ok) return -1;
    const body = await res.json().catch(() => ({}));
    return (body.entries ?? []).length;
  };

  const deadline = Date.now() + 90_000;
  const pending = new Map(Object.entries(expected));

  while (pending.size && Date.now() < deadline) {
    for (const [ctUid, want] of [...pending]) {
      const got = await probe(ctUid);
      if (got >= want) {
        log.ok(`${ctUid}: ${got}/${want} live`);
        pending.delete(ctUid);
      }
    }
    if (pending.size) await new Promise((r) => setTimeout(r, 5000));
  }

  if (pending.size) {
    for (const [ctUid, want] of pending) {
      log.warn(`${ctUid}: still short of ${want} after 90s — publish queue may be slow`);
    }
    log.info('re-run the script, or check the publish queue in the Contentstack UI');
  }
}

function writeEnvLocal(cfg, stack, tokens) {
  log.step('Write .env.local');
  const { hosts } = cfg;
  const body = `# Generated by scripts/bootstrap.mjs — do not edit by hand.
# Re-run \`npm run bootstrap\` to regenerate.

VITE_CONTENTSTACK_API_KEY=${stack.api_key}
VITE_CONTENTSTACK_DELIVERY_TOKEN=${tokens.deliveryToken}
VITE_CONTENTSTACK_PREVIEW_TOKEN=${tokens.previewToken}
VITE_CONTENTSTACK_ENVIRONMENT=${cfg.envName}
VITE_CONTENTSTACK_BRANCH=${cfg.branch}
VITE_CONTENTSTACK_LOCALE=${cfg.locale}

# Hosts derived from CS_INSTANCE=${hosts.instance}
VITE_CONTENTSTACK_API_HOST=${hosts.cdnHost}
VITE_CONTENTSTACK_APP_HOST=${hosts.appUrl}
VITE_CONTENTSTACK_PREVIEW_HOST=${hosts.previewHost}
VITE_CONTENTSTACK_GRAPHQL_PREVIEW_HOST=${hosts.graphqlPreviewHost}

VITE_SITE_URL=${cfg.siteUrl}
`;
  // `.env.local` is what Vite reads, so it always reflects the most recently
  // bootstrapped stack — that is the "active" one for `npm run dev`.
  fs.writeFileSync(path.join(ROOT, '.env.local'), body, 'utf8');
  log.ok('.env.local written (active stack for npm run dev)');

  // Also keep a per-stack sidecar. Without it, bootstrapping a second stack
  // silently destroys the first stack's derived tokens, and `gh:env` would then
  // publish the wrong values.
  if (envFile) {
    const base = path.basename(envFile);
    if (base !== '.env') {
      const sidecar = path.join(ROOT, `${base}.local`);
      fs.writeFileSync(sidecar, body, 'utf8');
      log.ok(`${base}.local written (per-stack record)`);
    }
  }
}

// --------------------------------------------------------------------- main

async function main() {
  const cfg = config();

  log.banner('Contentstack Visual Experience — bootstrap');
  log.value('instance', `${cfg.hosts.instance}${cfg.hosts.isProd ? '' : ' (non-prod)'}`);
  log.value('cma', cfg.hosts.cmaBase);
  log.value('cdn', cfg.hosts.cdnBase);
  log.value('preview (rest)', cfg.hosts.previewUrl);
  log.value('preview (gql)', cfg.hosts.graphqlPreviewUrl);
  log.value('app', cfg.hosts.appUrl);
  log.value('site', cfg.siteUrl);
  if (cfg.orgName || cfg.orgUid) {
    log.value('org', `${cfg.orgName || '(by uid)'} ${cfg.orgUid ? `(${cfg.orgUid})` : ''}`.trim());
  }
  if (envFile) log.value('env file', envFile.replace(`${ROOT}/`, ''));

  const cma = new Cma({ cmaBase: cfg.hosts.cmaBase, branch: cfg.branch });

  log.step('Log in');
  const user = await cma.login({
    email: cfg.email,
    password: cfg.password,
    totpSecret: cfg.totpSecret,
    tfaToken: cfg.tfaToken,
  });
  log.ok(`authenticated as ${user.email}`);

  try {
    const orgUid = await resolveOrg(cma, cfg);
    await verifyStackInOrg(cma, cfg, orgUid);
    const stack = await resolveStack(cma, cfg, orgUid);
    cfg.stackApiKeyResolved = stack.api_key;
    await resolveEnvironment(cma, cfg);
    // Live Preview must be enabled BEFORE minting tokens, otherwise the
    // delivery token comes back without a preview token.
    await enableLivePreview(cma, cfg);
    const tokens = await resolveTokens(cma, cfg);
    await ensureTaxonomies(cma);
    await ensureGlobalFields(cma);
    await ensureContentTypes(cma);
    const assetUids = await ensureAssets(cma, cfg);
    const entries = await ensureEntries(cma, cfg, assetUids);
    await publishAll(cma, cfg, entries);
    writeEnvLocal(cfg, stack, tokens);

    if (!SKIP_PUBLISH) {
      await verifyPublished(cfg, tokens, {
        header: 1,
        footer: 1,
        author: entries.authors.length,
        blog_post: entries.posts.length,
        page: entries.pages.length,
      });
    }

    log.banner('Done.');
    if (!tokens.previewToken) {
      log.warn('No preview token: drafts will NOT render in Live Preview / Visual Builder.');
      log.info('Preview Token is plan-gated on this stack (CMA error_code 600).');
    }
    console.log(`
  Next:
    npm run dev                 # serve the site on ${cfg.siteUrl}

  Then open Visual Builder:
    ${cfg.hosts.appUrl}/#!/stack/${stack.api_key}/visual-builder

  Pages created: ${entries.pages.map((p) => p.url).join('  ')}
  Posts created: ${entries.posts.length}
`);
  } finally {
    await cma.logout();
  }
}

main().catch((err) => {
  console.error('');
  if (err instanceof CmaError) {
    log.err(`${err.message}`);
    if (err.status) log.info(`status: ${err.status}`);
    if (err.url) log.info(`url: ${err.url}`);
    if (err.body) log.info(`body: ${JSON.stringify(err.body).slice(0, 600)}`);
  } else {
    log.err(err?.message || String(err));
    if (err?.stack) log.info(err.stack.split('\n').slice(1, 4).join('\n'));
  }
  process.exit(1);
});
