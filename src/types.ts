import type { CslpMap } from "./utils/cslp";

export interface WithCslp {
  /** Edit-tag map attached by `addEditableTags`. */
  $?: CslpMap;
}

export interface EntryBase extends WithCslp {
  uid: string;
  title: string;
  locale?: string;
  _content_type_uid?: string;
}

export interface CsFile {
  uid: string;
  url: string;
  title?: string;
  filename?: string;
}

/** A `link` field. The entry value uses `href`, not `url`. */
export interface CsLink extends WithCslp {
  title?: string;
  href?: string;
}

/** A `taxonomy` field value. */
export interface CsTaxonomyTerm {
  taxonomy_uid: string;
  term_uid: string;
}

/** The `seo_metadata` global field. */
export interface SeoMetadata extends WithCslp {
  meta_title?: string;
  meta_description?: string;
  og_image?: CsFile | null;
  canonical_url?: CsLink;
  no_index?: boolean;
}

export interface HeaderEntry extends EntryBase {
  brand_name?: string;
  tagline?: string;
  logo?: CsFile | null;
  navigation_links?: Array<WithCslp & { target?: CsLink; emphasised?: boolean }>;
}

export interface FooterEntry extends EntryBase {
  copyright?: string;
  tagline?: string;
  link_columns?: Array<
    WithCslp & {
      heading?: string;
      links?: Array<WithCslp & { target?: CsLink }>;
    }
  >;
}

export interface AuthorEntry extends EntryBase {
  bio?: string;
  avatar?: CsFile | null;
  role?: string;
  social_links?: Array<WithCslp & { target?: CsLink }>;
}

export interface BlogPostEntry extends EntryBase {
  url: string;
  excerpt?: string;
  featured_image?: CsFile | null;
  /** JSON RTE, converted to an HTML string by Utils.jsonToHTML. */
  body?: string;
  /** Reference field — an array even when single. */
  author?: AuthorEntry[];
  published_on?: string;
  reading_minutes?: number;
  featured?: boolean;
  tier?: string;
  seo?: SeoMetadata;
  taxonomies?: CsTaxonomyTerm[];
}

// ------------------------------------------------------------------- blocks

export interface HeroBlock extends WithCslp {
  heading?: string;
  subheading?: string;
  cta?: CsLink;
  background_image?: CsFile | null;
  alignment?: string;
  height?: string;
}

/** JSON RTE — arrives as an HTML string after jsonToHTML. */
export interface RichTextBlock extends WithCslp {
  heading?: string;
  body?: string;
}

/** Markdown source, rendered client-side. */
export interface MarkdownBlock extends WithCslp {
  heading?: string;
  body?: string;
}

export interface FeatureGridBlock extends WithCslp {
  heading?: string;
  description?: string;
  columns?: number;
  features?: Array<
    WithCslp & {
      icon?: string;
      title?: string;
      description?: string;
      learn_more?: CsLink;
    }
  >;
}

export interface StatsBandBlock extends WithCslp {
  heading?: string;
  stats?: Array<WithCslp & { value?: string; label?: string }>;
}

/** HTML RTE — already an HTML string on the wire. */
export interface ImageTextBlock extends WithCslp {
  heading?: string;
  body?: string;
  image?: CsFile | null;
  image_on_right?: boolean;
}

export interface LatestPostsBlock extends WithCslp {
  heading?: string;
  description?: string;
  posts?: BlogPostEntry[];
  max_items?: number;
}

export interface FaqBlock extends WithCslp {
  heading?: string;
  items?: Array<WithCslp & { question?: string; answer?: string }>;
}

export interface QuoteBlock extends WithCslp {
  quote?: string;
  attribution?: string;
  role?: string;
  avatar?: CsFile | null;
}

export interface CtaBannerBlock extends WithCslp {
  heading?: string;
  body?: string;
  button?: CsLink;
  tone?: string;
}

/** One modular-blocks item: exactly one key, matching the block uid. */
export interface PageComponent {
  hero?: HeroBlock;
  rich_text?: RichTextBlock;
  markdown_section?: MarkdownBlock;
  feature_grid?: FeatureGridBlock;
  stats_band?: StatsBandBlock;
  image_text?: ImageTextBlock;
  latest_posts?: LatestPostsBlock;
  faq?: FaqBlock;
  quote?: QuoteBlock;
  cta_banner?: CtaBannerBlock;
}

export interface PageEntry extends EntryBase {
  url: string;
  seo_description?: string;
  page_components?: PageComponent[];
  seo?: SeoMetadata;
  taxonomies?: CsTaxonomyTerm[];
}
