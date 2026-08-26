/**
 * Seed content.
 *
 * Entry value shapes that are easy to get wrong (all verified against
 * visual-builder/tests/data/entries/*):
 *   link      -> { title, href }                        NOT { title, url }
 *   reference -> [{ uid, _content_type_uid }]
 *   taxonomy  -> [{ taxonomy_uid, term_uid }]            field uid is `taxonomies`
 *   file      -> the asset object; null when unset
 *   select    -> the plain choice string
 *   json_rte  -> a { type: 'doc', children: [...] } document
 *   markdown  -> a plain markdown string
 *   html_rte  -> an HTML string
 *
 * Idempotency keys: singletons by `title`, pages/posts/authors by `url`/`title`.
 */
import crypto from 'node:crypto';
import { ASSET_REF } from './assets.mjs';

const uid = () => crypto.randomBytes(10).toString('hex');

/** Minimal JSON RTE document. */
export function rteDoc(paragraphs) {
  return {
    type: 'doc',
    uid: uid(),
    attrs: {},
    children: paragraphs.map((text) => ({
      type: 'p',
      uid: uid(),
      attrs: {},
      children: [{ text }],
    })),
    _version: 1,
  };
}

const lnk = (title, href) => ({ title, href });
const tax = (topic, audience) => [
  { taxonomy_uid: 'topic', term_uid: topic },
  { taxonomy_uid: 'audience', term_uid: audience },
];
const seo = (meta_title, meta_description, { ogKey = null, noIndex = false } = {}) => ({
  meta_title,
  meta_description,
  og_image: ogKey ? ASSET_REF(ogKey) : null,
  canonical_url: lnk('', ''),
  no_index: noIndex,
});

// ------------------------------------------------------------------ chrome

export const HEADER = {
  title: 'Site Header',
  brand_name: 'Lumen',
  tagline: 'Observability without the noise',
  logo: ASSET_REF('logo'),
  navigation_links: [
    { target: lnk('Home', '/'), emphasised: false },
    { target: lnk('Platform', '/platform'), emphasised: false },
    { target: lnk('Pricing', '/pricing'), emphasised: false },
    { target: lnk('Blog', '/blog/signal-over-noise'), emphasised: true },
  ],
};

export const FOOTER = {
  title: 'Site Footer',
  copyright: `© ${new Date().getUTCFullYear()} Lumen Systems, Inc.`,
  tagline: 'Built with Contentstack Visual Experience.',
  link_columns: [
    {
      heading: 'Product',
      links: [
        { target: lnk('Platform', '/platform') },
        { target: lnk('Pricing', '/pricing') },
      ],
    },
    {
      heading: 'Writing',
      links: [
        { target: lnk('Signal Over Noise', '/blog/signal-over-noise') },
        { target: lnk('Cold Paths', '/blog/cost-of-a-cold-path') },
      ],
    },
  ],
};

// ----------------------------------------------------------------- authors

export const AUTHORS = [
  {
    title: 'Dara Whitfield',
    bio: 'Works on instrumentation and incident practice. Believes most dashboards are decoration.',
    avatar: ASSET_REF('avatar-dara'),
    role: 'Staff Engineer',
    social_links: [{ target: lnk('Website', 'https://example.com/dara') }],
  },
  {
    title: 'Iman Rasheed',
    bio: 'Performance engineering, with a particular interest in the requests nobody measures.',
    avatar: ASSET_REF('avatar-iman'),
    role: 'Engineering Manager',
    social_links: [{ target: lnk('Website', 'https://example.com/iman') }],
  },
  {
    title: 'Priya Venkataraman',
    bio: 'On-call design and alert hygiene. Deletes more than she adds.',
    avatar: ASSET_REF('avatar-priya'),
    role: 'Developer Advocate',
    social_links: [{ target: lnk('Website', 'https://example.com/priya') }],
  },
];

// --------------------------------------------------------------- blog posts

/** `author` is filled in by bootstrap once author uids exist. */
export const BLOG_POSTS = [
  {
    title: 'Signal Over Noise',
    url: '/blog/signal-over-noise',
    excerpt: 'Most dashboards measure activity. Very few measure understanding.',
    featured_image: ASSET_REF('post-signal'),
    authorName: 'Dara Whitfield',
    published_on: '2026-06-12T09:00:00.000Z',
    reading_minutes: 6,
    featured: true,
    tier: 'public',
    seo: seo(
      'Signal Over Noise — Lumen',
      'Why adding another dashboard panel rarely shortens an incident.',
    ),
    taxonomies: tax('observability', 'engineers'),
    body: rteDoc([
      'A dashboard that shows everything shows nothing. The instinct when a system grows is to add another panel, another counter, another alert — and each addition feels like diligence.',
      'The teams that recover fastest from incidents are rarely the ones with the most instrumentation. They are the ones who agreed, in advance, on the three numbers that mean "this is broken".',
      'Start by deleting. For every panel on your primary dashboard, ask what decision it changes. If nothing, it is decoration.',
    ]),
  },
  {
    title: 'The Cost of a Cold Path',
    url: '/blog/cost-of-a-cold-path',
    excerpt: 'Latency you never measure is latency your users absorb for you.',
    featured_image: ASSET_REF('post-coldpath'),
    authorName: 'Iman Rasheed',
    published_on: '2026-07-03T09:00:00.000Z',
    reading_minutes: 8,
    featured: true,
    tier: 'public',
    seo: seo(
      'The Cost of a Cold Path — Lumen',
      'Median latency hides your newest users by construction.',
    ),
    taxonomies: tax('performance', 'engineers'),
    body: rteDoc([
      'Cold paths are the requests that fall outside your cache, your happy path, and usually your monitoring. They are also the requests your newest users are most likely to make.',
      'Measuring the median hides them by construction. The median user is a returning user with a warm cache; the tail is where first impressions live.',
      'Track p99 by cohort, not in aggregate. A flat p99 across a growing user base often means your new users are getting steadily worse service.',
    ]),
  },
  {
    title: 'Instrumentation Is a Product Decision',
    url: '/blog/instrumentation-is-product',
    excerpt: 'What you choose to measure quietly decides what you are able to improve.',
    featured_image: ASSET_REF('post-instrumentation'),
    authorName: 'Dara Whitfield',
    published_on: '2026-07-28T09:00:00.000Z',
    reading_minutes: 5,
    featured: false,
    tier: 'members',
    seo: seo(
      'Instrumentation Is a Product Decision — Lumen',
      'You cannot prioritise a problem you have no number for.',
    ),
    taxonomies: tax('product', 'engineering_leaders'),
    body: rteDoc([
      'Engineering treats instrumentation as plumbing. In practice it is closer to roadmap: you cannot prioritise a problem you have no number for.',
      'When a team says a concern is "hard to quantify", that is usually a statement about their instrumentation, not about the concern.',
      'The useful question in planning is not "what should we build" but "what would we need to see to know whether it worked".',
    ]),
  },
  {
    title: 'Alerts That Earn Their Interruption',
    url: '/blog/alerts-that-earn-it',
    excerpt: 'An alert nobody acts on is a recurring tax on attention.',
    featured_image: ASSET_REF('post-alerts'),
    authorName: 'Priya Venkataraman',
    published_on: '2026-08-14T09:00:00.000Z',
    reading_minutes: 7,
    featured: false,
    tier: 'public',
    seo: seo(
      'Alerts That Earn Their Interruption — Lumen',
      'Audit every page by whether a human took an action.',
    ),
    taxonomies: tax('oncall', 'engineers'),
    body: rteDoc([
      'Every alert makes a claim: this is worth waking someone. Most alerting configurations never revisit that claim after the day they were written.',
      'A simple audit works well. Export a quarter of pages, and for each one ask whether a human took an action they would not otherwise have taken.',
      'Alerts that fail the audit should not be tuned. They should be deleted, and the underlying signal moved to a dashboard where it belongs.',
    ]),
  },
];

// --------------------------------------------------------------------- pages

export const PAGES = [
  {
    title: 'Home',
    url: '/',
    seo_description: 'Observability tooling that helps teams find the signal that matters.',
    seo: seo('Lumen — Observability without the noise', 'Fewer dashboards, faster diagnosis.', { ogKey: 'og-home' }),
    taxonomies: tax('observability', 'engineers'),
    page_components: [
      {
        hero: {
          heading: 'Understand your system, not just its metrics',
          subheading:
            'Lumen turns scattered telemetry into a small number of answers your team can act on — and cuts the dashboards nobody reads.',
          cta: lnk('Read the blog', '/blog/signal-over-noise'),
          background_image: ASSET_REF('hero-home'),
          alignment: 'center',
          height: 'tall',
        },
      },
      {
        stats_band: {
          heading: 'Where teams end up after a quarter',
          stats: [
            { value: '68%', label: 'Fewer dashboards in active use' },
            { value: '2.4x', label: 'Faster mean time to diagnosis' },
            { value: '91%', label: 'Alerts that lead to an action' },
          ],
        },
      },
      {
        feature_grid: {
          heading: 'Built around the questions you actually ask',
          description: 'Four capabilities, each aimed at a decision rather than a chart.',
          columns: 4,
          features: [
            {
              icon: '◎',
              title: 'Scoped signals',
              description: 'Define the handful of numbers that mean "broken" and let everything else stay out of the way.',
              learn_more: lnk('How scoping works', '/platform'),
            },
            {
              icon: '◔',
              title: 'Cohort latency',
              description: 'See p99 split by cohort, so a healthy aggregate cannot hide a degrading tail.',
              learn_more: lnk('Read the post', '/blog/cost-of-a-cold-path'),
            },
            {
              icon: '◈',
              title: 'Alert auditing',
              description: 'Every page is scored on whether a human acted, so useless alerts surface themselves.',
              learn_more: lnk('Read the post', '/blog/alerts-that-earn-it'),
            },
            {
              icon: '◇',
              title: 'Shared vocabulary',
              description: 'One versioned definition per metric, so debates are about causes not numbers.',
              learn_more: lnk('See the platform', '/platform'),
            },
          ],
        },
      },
      {
        image_text: {
          heading: 'Start by deleting',
          // HTML RTE
          body: '<p>The fastest improvement most teams make is <strong>subtractive</strong>. Lumen ranks every panel and alert by how often it changed a decision, which makes the removal conversation concrete instead of political.</p>',
          image: ASSET_REF('split-delete'),
          image_on_right: true,
        },
      },
      {
        quote: {
          quote:
            'We deleted two thirds of our dashboards in a month and our time to diagnosis halved. Nobody has asked for them back.',
          attribution: 'Sana Iqbal',
          role: 'Director of Platform, Northwind',
          avatar: ASSET_REF('avatar-sana'),
        },
      },
      {
        latest_posts: {
          heading: 'From the blog',
          description: 'Notes on instrumentation, incident practice, and measuring the right things.',
          max_items: 3,
        },
      },
      {
        cta_banner: {
          heading: 'Fewer numbers, better decisions',
          body: 'Everything on this page is editable in Visual Builder — try clicking any heading.',
          button: lnk('View the platform', '/platform'),
          tone: 'dark',
        },
      },
    ],
  },
  {
    title: 'Platform',
    url: '/platform',
    seo_description: 'How Lumen collects, scopes, and audits the signals your team relies on.',
    seo: seo('Platform — Lumen', 'Collection you can reason about, definitions that stay stable.', { ogKey: 'og-platform' }),
    taxonomies: tax('engineering', 'engineers'),
    page_components: [
      {
        hero: {
          heading: 'One pipeline, three guarantees',
          subheading:
            'Collection you can reason about, definitions that stay stable, and an audit trail for every alert you keep.',
          cta: lnk('See pricing', '/pricing'),
          background_image: null,
          alignment: 'left',
          height: 'standard',
        },
      },
      {
        rich_text: {
          heading: 'Collection',
          body: rteDoc([
            'Lumen ingests OpenTelemetry traces, metrics, and structured logs without a proprietary agent. Sampling is decided per-cohort rather than globally, so low-traffic paths keep enough resolution to stay diagnosable.',
          ]),
        },
      },
      {
        markdown_section: {
          heading: 'Definitions',
          // Markdown field
          body: [
            'Every metric has a **single versioned definition**. Changing it produces a diff and a migration note.',
            '',
            '- `p99_checkout` — owned by Payments',
            '- `cold_start_ratio` — owned by Platform',
            '- `alert_action_rate` — owned by SRE',
            '',
            'A dashboard that shifts overnight always has a traceable cause.',
          ].join('\n'),
        },
      },
      {
        feature_grid: {
          heading: 'What ships in the core plan',
          description: 'No add-on tiers for the parts that make the product work.',
          columns: 3,
          features: [
            {
              icon: '◎',
              title: 'OTel-native ingest',
              description: 'Point your existing collector at Lumen and keep your instrumentation.',
              learn_more: lnk('', ''),
            },
            {
              icon: '◔',
              title: 'Cohort sampling',
              description: 'Per-cohort retention so the tail survives aggregation.',
              learn_more: lnk('', ''),
            },
            {
              icon: '◈',
              title: 'Definition registry',
              description: 'Versioned metric definitions with diffs on change.',
              learn_more: lnk('', ''),
            },
          ],
        },
      },
      {
        faq: {
          heading: 'Common questions',
          items: [
            {
              question: 'Do we have to replace our collector?',
              answer: 'No. Lumen accepts standard OpenTelemetry, so your existing collector configuration keeps working.',
            },
            {
              question: 'How long does a migration take?',
              answer: 'Most teams move within a single sprint, running both backends in parallel for the first week.',
            },
            {
              question: 'What happens to our old dashboards?',
              answer: 'They are imported read-only, then ranked by how often each panel changed a decision so you can retire them with evidence.',
            },
          ],
        },
      },
      {
        cta_banner: {
          heading: 'Try the editing experience',
          body: 'This page is one Page entry composed of modular blocks. Add, reorder, or delete a block in Visual Builder and watch it update live.',
          button: lnk('Back home', '/'),
          tone: 'accent',
        },
      },
    ],
  },
  {
    title: 'Pricing',
    url: '/pricing',
    seo_description: 'Straightforward per-seat pricing with no metric-count surprises.',
    seo: seo('Pricing — Lumen', 'Per-seat pricing, because metric-count billing punishes instrumentation.', { ogKey: 'og-pricing' }),
    taxonomies: tax('product', 'executives'),
    page_components: [
      {
        hero: {
          heading: 'Priced per person, not per metric',
          subheading:
            'Metric-count billing punishes exactly the instrumentation you want teams to add. We bill per seat instead.',
          cta: lnk('Read the reasoning', '/blog/instrumentation-is-product'),
          background_image: null,
          alignment: 'center',
          height: 'compact',
        },
      },
      {
        stats_band: {
          heading: 'Plans',
          stats: [
            { value: '$0', label: 'Starter — 3 seats, 7-day retention' },
            { value: '$29', label: 'Team — per seat / month, 90-day retention' },
            { value: 'Custom', label: 'Enterprise — SSO, audit export, SLA' },
          ],
        },
      },
      {
        rich_text: {
          heading: 'Why not usage-based',
          body: rteDoc([
            'Usage-based observability pricing creates a direct incentive to under-instrument, and the cost lands hardest on the teams with the most complex systems.',
            'Per-seat pricing is less clever and produces better engineering.',
          ]),
        },
      },
      {
        faq: {
          heading: 'Billing questions',
          items: [
            {
              question: 'Do read-only viewers need a seat?',
              answer: 'No. Dashboard viewers are free; seats are only for people who create or edit.',
            },
            {
              question: 'Is there a data volume cap?',
              answer: 'There is a fair-use ceiling well above typical usage, and we contact you before it ever applies.',
            },
          ],
        },
      },
      {
        cta_banner: {
          heading: 'Questions about a migration?',
          body: 'Most teams move over a single sprint, keeping their existing OpenTelemetry setup in place.',
          button: lnk('Read the blog', '/blog/cost-of-a-cold-path'),
          tone: 'light',
        },
      },
    ],
  },
];
