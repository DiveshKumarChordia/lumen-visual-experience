/**
 * GraphQL Preview API client.
 *
 * Endpoint: POST https://<instance->graphql-preview.<domain>/stacks/<apiKey>
 * (preview-api/backend/graphql — `@Controller('/stacks/:apiKey')`, and
 *  GRAPH_PREVIEW_URL in its e2e/playwright/.env.example)
 *
 * Unlike the REST side there is NO SDK path here: the `contentstack` JS delivery
 * SDK is REST-only, so GraphQL preview is the one case where application code
 * legitimately builds the request itself. The auth triple is the same one the
 * delivery SDK sets internally for REST — `api_key`, `preview_token` and the
 * `live_preview` hash — plus `release_id` / `preview_timestamp`.
 *
 * The hash comes from `ContentstackLivePreview.hash` (the documented accessor),
 * never from a hand-parsed URL param.
 *
 * Schema conventions (generated per stack from the content types):
 *   all_<content_type_uid> { items { ... system { uid } } }   list
 *   <content_type_uid>(uid: "...") { ... }                    single entry
 *   <field>Connection { edges { node { ... } } }              reference / file
 */
import config from "../config";
import { livePreviewHash } from "../sdk/previewContext";

const graphqlHost =
  config.GRAPHQL_PREVIEW_HOST ||
  config.API_HOST.replace("cdn", "graphql-preview").replace(".io", ".com");

export const GRAPHQL_PREVIEW_URL = `https://${graphqlHost}/stacks/${config.API_KEY}`;

export interface GqlResult<T> {
  data?: T;
  errors?: Array<{ message?: string; extensions?: { errors?: unknown } }>;
}

export class GraphqlPreviewError extends Error {
  constructor(
    message: string,
    readonly errors: unknown,
  ) {
    super(message);
    this.name = "GraphqlPreviewError";
  }
}

export type PreviewMode =
  /** Latest saved content, including unpublished drafts. */
  | { kind: "live" }
  /** Content as if a specific Release were deployed. */
  | { kind: "release"; releaseUid: string }
  /** Content as of a point in time, resolved against the Release timeline. */
  | { kind: "timestamp"; timestamp: string };

export interface GraphqlOptions {
  /** Defaults to `ContentstackLivePreview.hash`. */
  previewHash?: string;
  mode?: PreviewMode;
  /**
   * Requires the auto-draft plan AND `stack.settings.entries.auto_draft_enabled`
   * (preview-rest-api draft.interceptor.ts).
   */
  enableEntryDraft?: boolean;
  /** Personalize variant uids, most-specific first. */
  variantUids?: string[];
  branch?: string;
}

function buildHeaders(opts: GraphqlOptions): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    api_key: config.API_KEY,
    preview_token: config.PREVIEW_TOKEN,
    environment: config.ENVIRONMENT,
    branch: opts.branch ?? config.BRANCH,
  };

  const hash = opts.previewHash ?? livePreviewHash();
  if (hash) h.live_preview = hash;

  const mode: PreviewMode = opts.mode ?? { kind: "live" };
  if (mode.kind === "release") h.release_id = mode.releaseUid;
  if (mode.kind === "timestamp") h.preview_timestamp = mode.timestamp;

  if (opts.enableEntryDraft !== undefined) {
    h["x-cs-preview-enable-entry-draft"] = String(opts.enableEntryDraft);
  }
  if (opts.variantUids?.length) {
    h["x-cs-variant-uid"] = opts.variantUids.join(",");
  }
  return h;
}

/** Raw query execution. Throws on GraphQL-level errors, not just HTTP ones. */
export async function query<T = unknown>(
  gql: string,
  variables: Record<string, unknown> = {},
  opts: GraphqlOptions = {},
): Promise<T> {
  const res = await fetch(GRAPHQL_PREVIEW_URL, {
    method: "POST",
    headers: buildHeaders(opts),
    body: JSON.stringify({ query: gql, variables }),
  });

  const body = (await res.json().catch(() => ({}))) as GqlResult<T>;

  if (body.errors?.length) {
    // The server puts the real reason under extensions.errors and leaves
    // `message` generic ("Failed to fetch item"), so surface both.
    const detail = body.errors
      .map((e) => e.message ?? JSON.stringify(e.extensions?.errors))
      .join("; ");
    throw new GraphqlPreviewError(detail || "GraphQL error", body.errors);
  }
  if (!res.ok) {
    throw new GraphqlPreviewError(`${res.status} ${res.statusText}`, body);
  }
  if (!body.data) throw new GraphqlPreviewError("Empty GraphQL response", body);

  return body.data;
}

// ------------------------------------------------------- typed convenience

export interface GqlPage {
  title: string;
  url: string;
  seo_description?: string;
  system: { uid: string; content_type_uid?: string };
}

/** All pages, showing the `all_<ct>` / `items` / `system` shape. */
export async function fetchPages(opts: GraphqlOptions = {}): Promise<GqlPage[]> {
  const data = await query<{ all_page: { items: GqlPage[] } }>(
    `query Pages {
      all_page {
        items {
          title
          url
          seo_description
          system { uid content_type_uid }
        }
      }
    }`,
    {},
    opts,
  );
  return data.all_page?.items ?? [];
}

export interface GqlBlogPost {
  title: string;
  url: string;
  excerpt?: string;
  author_name?: string;
  published_on?: string;
  system: { uid: string };
}

export async function fetchBlogPosts(
  opts: GraphqlOptions = {},
): Promise<GqlBlogPost[]> {
  const data = await query<{ all_blog_post: { items: GqlBlogPost[] } }>(
    `query BlogPosts {
      all_blog_post {
        items {
          title
          url
          excerpt
          author_name
          published_on
          system { uid }
        }
      }
    }`,
    {},
    opts,
  );
  return data.all_blog_post?.items ?? [];
}

/**
 * A single page including its modular blocks. Blocks are a union in GraphQL,
 * so each variant is selected with an inline fragment.
 */
export async function fetchPageByUrl(
  url: string,
  opts: GraphqlOptions = {},
): Promise<unknown> {
  const data = await query<{ all_page: { items: unknown[] } }>(
    `query PageByUrl($url: String!) {
      all_page(where: { url: $url }) {
        items {
          title
          url
          system { uid }
          page_components {
            ... on PagePageComponentsHero {
              hero { heading subheading cta_label cta_url }
            }
            ... on PagePageComponentsCtaBanner {
              cta_banner { heading body button_label button_url }
            }
            ... on PagePageComponentsStatsBand {
              stats_band { heading stats { value label } }
            }
          }
        }
      }
    }`,
    { url },
    opts,
  );
  return data.all_page?.items?.[0] ?? null;
}
