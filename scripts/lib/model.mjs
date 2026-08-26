/**
 * Content model.
 *
 * Built to exercise every field type Visual Builder can edit, while still
 * modelling a real site rather than a field zoo. Field shapes live in
 * ./fields.mjs; see that file for the SDK references behind each one.
 *
 * Coverage of FieldDataType (live-preview-sdk/src/visualBuilder/utils/types):
 *   SINGLELINE, MULTILINE, HTML_RTE, MARKDOWN_RTE, SELECT, URL, JSON_RTE,
 *   NUMBER, BOOLEAN, ISODATE, FILE, LINK, REFERENCE, GROUP, MODULAR_BLOCK,
 *   GLOBAL_FIELD, TAXONOMY
 *
 * Not covered, and why:
 *   CUSTOM_FIELD          needs a UI extension installed on the stack
 *   EXPERIENCE_CONTAINER  needs a Personalize project + experience
 *   BLOCK                 the inner block of a modular block, not a top-level type
 */
import {
  blocks,
  boolean,
  file,
  globalField,
  group,
  htmlRte,
  isodate,
  jsonRte,
  link,
  markdown,
  multiline,
  number,
  reference,
  select,
  singleline,
  taxonomy,
  title,
  url,
} from './fields.mjs';

// ---------------------------------------------------------------- taxonomies

/**
 * Created before any content type, because the CMA validates `taxonomy_uid`
 * when a taxonomy field is saved.
 *
 * `topic` is deliberately hierarchical to show nested terms (`parent_uid`).
 */
export const TAXONOMIES = [
  {
    uid: 'topic',
    name: 'Topic',
    description: 'What a piece of content is about.',
    terms: [
      { uid: 'engineering', name: 'Engineering' },
      { uid: 'observability', name: 'Observability', parent_uid: 'engineering' },
      { uid: 'performance', name: 'Performance', parent_uid: 'engineering' },
      { uid: 'practice', name: 'Practice' },
      { uid: 'oncall', name: 'On-call', parent_uid: 'practice' },
      { uid: 'product', name: 'Product' },
    ],
  },
  {
    uid: 'audience',
    name: 'Audience',
    description: 'Who the content is written for.',
    terms: [
      { uid: 'engineers', name: 'Engineers' },
      { uid: 'engineering_leaders', name: 'Engineering Leaders' },
      { uid: 'executives', name: 'Executives' },
    ],
  },
];

// -------------------------------------------------------------- global fields

/**
 * SEO metadata, defined once and reused by `page` and `blog_post`. This is the
 * point of a global field: one schema, many content types, edited in place.
 */
export const GLOBAL_FIELDS = [
  {
    uid: 'seo_metadata',
    title: 'SEO Metadata',
    description: 'Shared search and social metadata.',
    schema: [
      singleline('meta_title', 'Meta Title'),
      multiline('meta_description', 'Meta Description'),
      file('og_image', 'Social Share Image'),
      link('canonical_url', 'Canonical URL'),
      boolean('no_index', 'Hide from search engines'),
    ],
  },
];

// -------------------------------------------------------------- page blocks

/** Each block is one editable section in Visual Builder. */
const PAGE_BLOCKS = [
  {
    title: 'Hero',
    uid: 'hero',
    schema: [
      singleline('heading', 'Heading'),
      multiline('subheading', 'Subheading'),
      link('cta', 'Call to Action'),
      file('background_image', 'Background Image'),
      select('alignment', 'Text Alignment', ['center', 'left']),
      select('height', 'Height', ['tall', 'standard', 'compact']),
    ],
  },
  {
    title: 'Rich Text',
    uid: 'rich_text',
    schema: [
      singleline('heading', 'Heading'),
      // JSON RTE: structured, and the format Contentstack recommends.
      jsonRte('body', 'Body'),
    ],
  },
  {
    title: 'Markdown',
    uid: 'markdown_section',
    schema: [
      singleline('heading', 'Heading'),
      // Markdown is its own editor in VB, distinct from both RTE types.
      markdown('body', 'Body (Markdown)'),
    ],
  },
  {
    title: 'Feature Grid',
    uid: 'feature_grid',
    schema: [
      singleline('heading', 'Heading'),
      multiline('description', 'Description'),
      number('columns', 'Columns'),
      group('features', 'Features', [
        singleline('icon', 'Icon (emoji)'),
        singleline('title', 'Title'),
        multiline('description', 'Description'),
        link('learn_more', 'Learn More'),
      ]),
    ],
  },
  {
    title: 'Stats Band',
    uid: 'stats_band',
    schema: [
      singleline('heading', 'Heading'),
      group('stats', 'Stats', [
        singleline('value', 'Value'),
        singleline('label', 'Label'),
      ]),
    ],
  },
  {
    title: 'Image + Text',
    uid: 'image_text',
    schema: [
      singleline('heading', 'Heading'),
      // HTML RTE: the third rich-text flavour, so all three are represented.
      htmlRte('body', 'Body (Rich Text)'),
      file('image', 'Image'),
      boolean('image_on_right', 'Image on Right'),
    ],
  },
  {
    title: 'Latest Posts',
    uid: 'latest_posts',
    schema: [
      singleline('heading', 'Heading'),
      multiline('description', 'Description'),
      reference('posts', 'Posts', ['blog_post']),
      number('max_items', 'Max Items'),
    ],
  },
  {
    title: 'FAQ',
    uid: 'faq',
    schema: [
      singleline('heading', 'Heading'),
      group('items', 'Questions', [
        singleline('question', 'Question'),
        multiline('answer', 'Answer'),
      ]),
    ],
  },
  {
    title: 'Quote',
    uid: 'quote',
    schema: [
      multiline('quote', 'Quote'),
      singleline('attribution', 'Attribution'),
      singleline('role', 'Role'),
      file('avatar', 'Avatar'),
    ],
  },
  {
    title: 'CTA Banner',
    uid: 'cta_banner',
    schema: [
      singleline('heading', 'Heading'),
      multiline('body', 'Body'),
      link('button', 'Button'),
      select('tone', 'Tone', ['dark', 'light', 'accent']),
    ],
  },
];

// ------------------------------------------------------------- content types

export const CONTENT_TYPES = [
  {
    title: 'Header',
    uid: 'header',
    description: 'Site header: brand and primary navigation.',
    schema: [
      title(),
      singleline('brand_name', 'Brand Name'),
      singleline('tagline', 'Tagline'),
      file('logo', 'Logo'),
      group('navigation_links', 'Navigation Links', [
        link('target', 'Link'),
        boolean('emphasised', 'Emphasised'),
      ]),
    ],
    options: { is_page: false, singleton: true, title: 'title', sub_title: [] },
  },
  {
    title: 'Footer',
    uid: 'footer',
    description: 'Site footer: copyright and secondary navigation.',
    schema: [
      title(),
      singleline('copyright', 'Copyright'),
      multiline('tagline', 'Tagline'),
      group('link_columns', 'Link Columns', [
        singleline('heading', 'Heading'),
        group('links', 'Links', [link('target', 'Link')]),
      ]),
    ],
    options: { is_page: false, singleton: true, title: 'title', sub_title: [] },
  },
  {
    title: 'Author',
    uid: 'author',
    description: 'A person who writes posts. Referenced, not a page.',
    schema: [
      title('Name'),
      multiline('bio', 'Bio'),
      file('avatar', 'Avatar'),
      select('role', 'Role', [
        'Staff Engineer',
        'Engineering Manager',
        'Developer Advocate',
        'Founder',
      ]),
      group('social_links', 'Social Links', [link('target', 'Link')]),
    ],
    options: { is_page: false, singleton: false, title: 'title', sub_title: ['bio'] },
  },
  {
    title: 'Blog Post',
    uid: 'blog_post',
    description: 'An article. A page, so it is editable in Visual Builder.',
    schema: [
      title(),
      url(),
      multiline('excerpt', 'Excerpt'),
      file('featured_image', 'Featured Image'),
      jsonRte('body', 'Body'),
      reference('author', 'Author', ['author'], { refMultiple: false }),
      isodate('published_on', 'Published On'),
      number('reading_minutes', 'Reading Time (minutes)'),
      boolean('featured', 'Featured'),
      select('tier', 'Access Tier', ['public', 'members', 'internal']),
      globalField('seo', 'SEO', 'seo_metadata'),
      // Taxonomy is root-only, so it lives here rather than inside a block.
      taxonomy(TAXONOMIES),
    ],
    options: {
      is_page: true,
      singleton: false,
      title: 'title',
      sub_title: ['excerpt'],
      url_pattern: '/blog/:title',
      url_prefix: '/blog/',
    },
  },
  {
    title: 'Page',
    uid: 'page',
    description: 'A composable page built from modular blocks.',
    schema: [
      title(),
      url(),
      multiline('seo_description', 'Short Description'),
      blocks('page_components', 'Page Components', PAGE_BLOCKS),
      globalField('seo', 'SEO', 'seo_metadata'),
      taxonomy(TAXONOMIES),
    ],
    options: {
      is_page: true,
      singleton: false,
      title: 'title',
      sub_title: ['seo_description'],
      url_pattern: '/:title',
      url_prefix: '/',
    },
  },
];

/** Authors before posts (referenced), posts before pages (referenced). */
export const CONTENT_TYPE_ORDER = ['header', 'footer', 'author', 'blog_post', 'page'];

export { PAGE_BLOCKS };
