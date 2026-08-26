#!/usr/bin/env node
/**
 * Point Contentstack at a different origin.
 *
 *   npm run site:url -- https://your-app.vercel.app
 *   npm run site:url -- http://localhost:3000     # switch back
 *
 * Visual Builder frames the site using the ENVIRONMENT's base URL, so after a
 * deploy this must be updated or the editor keeps loading localhost. Updates
 * both places that matter:
 *   1. the environment's `urls` entry for the locale
 *   2. stack.settings.live_preview['default-url']
 */
import { Cma, CmaError } from './lib/cma.mjs';
import { resolveHosts } from './lib/hosts.mjs';
import { log } from './lib/logger.mjs';

const target = process.argv[2];

if (!target || !/^https?:\/\//.test(target)) {
  log.err('Usage: npm run site:url -- <origin>');
  log.info('e.g.  npm run site:url -- https://your-app.vercel.app');
  process.exit(1);
}

const siteUrl = target.replace(/\/+$/, '');

const env = process.env;
const cfg = {
  email: env.CS_USER_EMAIL,
  password: env.CS_USER_PASSWORD,
  totpSecret: env.CS_USER_TOTP_SECRET || '',
  tfaToken: env.CS_USER_TFA_TOKEN || '',
  envName: (env.CS_ENVIRONMENT || 'development').trim(),
  locale: (env.CS_LOCALE || 'en-us').trim(),
  branch: (env.CS_BRANCH || 'main').trim(),
  apiKey: (env.CS_STACK_API_KEY || '').trim(),
  hosts: resolveHosts(env),
};

if (!cfg.apiKey) {
  log.err('CS_STACK_API_KEY is required.');
  process.exit(1);
}

async function main() {
  log.banner(`Point Contentstack at ${siteUrl}`);

  const cma = new Cma({
    cmaBase: cfg.hosts.cmaBase,
    apiKey: cfg.apiKey,
    branch: cfg.branch,
  });

  log.step('Log in');
  await cma.login(cfg);
  log.ok('authenticated');

  try {
    log.step(`Environment "${cfg.envName}" base URL`);
    await cma.updateEnvironment(cfg.envName, {
      urls: [{ locale: cfg.locale, url: siteUrl }],
    });
    log.ok(`-> ${siteUrl}`);

    log.step('Live Preview default-url');
    await cma.updateStackSettings({
      live_preview: {
        enabled: true,
        'default-env': cfg.envName,
        'default-locale': cfg.locale,
        'default-url': siteUrl,
      },
    });
    log.ok(`-> ${siteUrl}`);

    log.banner('Done.');
    console.log(`
  Visual Builder will now frame:
    ${siteUrl}

  Remember the deployed site needs these as build-time env vars:
    VITE_CONTENTSTACK_API_KEY
    VITE_CONTENTSTACK_DELIVERY_TOKEN
    VITE_CONTENTSTACK_PREVIEW_TOKEN
    VITE_CONTENTSTACK_ENVIRONMENT
    VITE_CONTENTSTACK_BRANCH
    VITE_CONTENTSTACK_LOCALE
    VITE_CONTENTSTACK_API_HOST
    VITE_CONTENTSTACK_APP_HOST
    VITE_CONTENTSTACK_PREVIEW_HOST
    VITE_CONTENTSTACK_GRAPHQL_PREVIEW_HOST

  They are all in .env.local — see \`npm run vercel:env\` to print them as
  ready-to-paste \`vercel env add\` commands.
`);
  } finally {
    await cma.logout();
  }
}

main().catch((err) => {
  log.err(err instanceof CmaError ? err.message : (err?.message ?? String(err)));
  process.exit(1);
});
