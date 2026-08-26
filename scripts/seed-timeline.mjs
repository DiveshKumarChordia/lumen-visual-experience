#!/usr/bin/env node
/**
 * Give the Timeline something to show.
 *
 *   npm run seed:timeline
 *   npm run seed:timeline -- --clear   # list what exists, change nothing
 *
 * Timeline preview resolves a `preview_timestamp` against future content
 * changes. With no scheduled changes and no releases, the timeline is
 * structurally empty regardless of plan or tracker state.
 *
 * This creates both kinds of future change:
 *
 *   1. Scheduled publishes — a NEW VERSION of an entry, scheduled to go live at
 *      a future date. The currently published version is untouched, so the live
 *      site keeps rendering today's content.
 *   2. Releases — named buckets of versioned items, which is what the timeline
 *      lays out as milestones.
 *
 * Contracts (preview-rest-api/e2e/playwright/tests/api/release-preview.api.spec.ts):
 *   POST /v3/releases                      header release_version: 2.0
 *   POST /v3/releases/:uid/items           { items: [{ uid, version, locale,
 *                                            content_type_uid, action }] }
 *   POST /v3/content_types/:ct/entries/:uid/publish
 *        { entry: { environments, locales }, version, scheduled_at, locale }
 */
import { Cma, CmaError } from './lib/cma.mjs';
import { normalizeForWrite } from './lib/entry-io.mjs';
import { resolveHosts } from './lib/hosts.mjs';
import { log } from './lib/logger.mjs';

const LIST_ONLY = process.argv.includes('--clear');

const env = process.env;
const cfg = {
  email: env.CS_USER_EMAIL,
  password: env.CS_USER_PASSWORD,
  totpSecret: env.CS_USER_TOTP_SECRET || '',
  tfaToken: env.CS_USER_TFA_TOKEN || '',
  apiKey: (env.CS_STACK_API_KEY || '').trim(),
  envName: (env.CS_ENVIRONMENT || 'development').trim(),
  locale: (env.CS_LOCALE || 'en-us').trim(),
  branch: (env.CS_BRANCH || 'main').trim(),
  hosts: resolveHosts(env),
};

const days = (n) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  d.setUTCHours(9, 0, 0, 0);
  return d.toISOString();
};

/**
 * Each step edits one page and schedules that new version for a future date, so
 * the timeline has distinct, inspectable milestones.
 */
const TIMELINE = [
  {
    releaseName: 'Autumn Messaging Refresh',
    at: days(7),
    pageUrl: '/',
    apply: (page) => {
      const c = structuredClone(page.page_components);
      const hero = c.find((b) => b.hero)?.hero;
      if (hero) {
        hero.heading = 'Stop guessing which dashboard matters';
        hero.subheading =
          'Autumn release: Lumen now ranks every panel by how often it changed a decision, so the ones that never do can go.';
      }
      return { page_components: c };
    },
  },
  {
    releaseName: 'Pricing Simplification',
    at: days(21),
    pageUrl: '/pricing',
    apply: (page) => {
      const c = structuredClone(page.page_components);
      const hero = c.find((b) => b.hero)?.hero;
      if (hero) hero.heading = 'One price, every feature';
      const stats = c.find((b) => b.stats_band)?.stats_band;
      if (stats) {
        stats.heading = 'Plans (from January)';
        stats.stats = [
          { value: '$0', label: 'Starter — 5 seats, 30-day retention' },
          { value: '$24', label: 'Team — per seat / month, 1-year retention' },
          { value: 'Custom', label: 'Enterprise — SSO, audit export, SLA' },
        ];
      }
      return { page_components: c };
    },
  },
  {
    releaseName: 'Platform Deep Dive',
    at: days(45),
    pageUrl: '/platform',
    apply: (page) => {
      const c = structuredClone(page.page_components);
      const hero = c.find((b) => b.hero)?.hero;
      if (hero) hero.heading = 'One pipeline, four guarantees';
      return { page_components: c };
    },
  },
];

async function main() {
  if (!cfg.apiKey) {
    log.err('CS_STACK_API_KEY is required.');
    process.exit(1);
  }

  log.banner('Seed Release timeline');
  log.value('stack', cfg.apiKey);
  log.value('environment', cfg.envName);

  const cma = new Cma({
    cmaBase: cfg.hosts.cmaBase,
    apiKey: cfg.apiKey,
    branch: cfg.branch,
  });

  log.step('Log in');
  await cma.login(cfg);
  log.ok('authenticated');

  try {
    // Scheduled publishes target the environment by UID.
    const envs = await cma.environments();
    const target = envs.find((e) => e.name === cfg.envName);
    if (!target) throw new Error(`No environment named "${cfg.envName}"`);
    log.value('environment_uid', target.uid);

    log.step('Existing releases');
    const existing = await cma.releases();
    if (!existing.length) log.info('(none)');
    for (const r of existing) {
      log.info(`${r.name} — ${r.uid} (${r.items?.length ?? '?'} items)`);
    }

    if (LIST_ONLY) {
      log.banner('Listing only — nothing changed.');
      return;
    }

    const byName = new Map(existing.map((r) => [r.name, r]));

    for (const step of TIMELINE) {
      log.step(`${step.releaseName}  →  ${step.at.slice(0, 10)}`);

      const [page] = await cma.entries('page', {
        query: { url: step.pageUrl },
        locale: cfg.locale,
      });
      if (!page) {
        log.warn(`no page at ${step.pageUrl} — run npm run bootstrap first`);
        continue;
      }

      // A new version. The published version is untouched, so the live site
      // keeps serving current content while this sits in the future.
      const patch = step.apply(page);
      // The GET expanded assets into objects; collapse them back to uids or the
      // PUT is rejected with "is not a valid upload."
      const updated = await cma.updateEntry(
        'page',
        page.uid,
        normalizeForWrite({ title: page.title, url: page.url, ...patch }),
        { locale: cfg.locale },
      );
      const version = updated?._version ?? (page._version ?? 1) + 1;
      log.ok(`${step.pageUrl} → v${version} (unpublished)`);

      let release = byName.get(step.releaseName);
      if (release) {
        log.skip(`release "${step.releaseName}" exists`);
      } else {
        release = await cma.createRelease({
          name: step.releaseName,
          description: `Scheduled for ${step.at.slice(0, 10)} by seed-timeline.mjs`,
        });
        log.ok(`created release "${step.releaseName}" (${release.uid})`);
      }

      try {
        await cma.addReleaseItems(release.uid, [
          {
            uid: page.uid,
            version,
            locale: cfg.locale,
            content_type_uid: 'page',
            action: 'publish',
          },
        ]);
        log.ok(`added ${step.pageUrl} v${version} to the release`);
      } catch (err) {
        log.warn(`add release item: ${err.message}`);
      }

      // The scheduled publish is what a `preview_timestamp` read resolves to.
      try {
        await cma.publishEntry('page', page.uid, {
          environments: [target.uid],
          locales: [cfg.locale],
          version,
          scheduledAt: step.at,
          locale: cfg.locale,
        });
        log.ok(`scheduled publish at ${step.at}`);
      } catch (err) {
        log.warn(`scheduled publish: ${err.message}`);
      }
    }

    log.banner('Done.');
    console.log(`
  Timeline milestones created. Preview them with:

    npm run preview:demo -- --timestamp ${days(10)}
    npm run preview:demo -- --timestamp ${days(30)}
    npm run preview:demo -- --timestamp ${days(60)}

  Each timestamp should resolve to a different version of the pages.
`);
  } finally {
    await cma.logout();
  }
}

main().catch((err) => {
  log.err(err instanceof CmaError ? err.message : (err?.message ?? String(err)));
  if (err?.body) log.info(JSON.stringify(err.body).slice(0, 400));
  process.exit(1);
});
