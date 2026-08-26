/**
 * Data access. Every fetch runs `addEditableTags` so each field carries the
 * `data-cslp` attribute Visual Builder's overlays key off — without it the site
 * renders but nothing is clickable in the editor.
 */
import { addEditableTags } from "@contentstack/utils";
import config from "../config";
import { getEntries, getEntryByUrl } from "../sdk/entry";
import {
  applyPreviewContext,
  clearPreviewContext,
  isStaleTrackerError,
  syncPreviewFromUrl,
  type PreviewContext,
} from "../sdk/previewContext";
import type {
  BlogPostEntry,
  FooterEntry,
  HeaderEntry,
  PageEntry,
} from "../types";

const locale = config.LOCALE;

/**
 * Read the URL-borne preview params exactly once. Doing it per fetch re-pins a
 * stale `live_preview` from the iframe URL and causes error_code 382.
 */
let urlSynced = false;
function armPreview(contentTypeUid: string, ctx?: PreviewContext): void {
  if (!urlSynced) {
    syncPreviewFromUrl();
    urlSynced = true;
  }
  applyPreviewContext({ contentTypeUid, ...ctx });
}

/** Set when a dead tracker forced a fallback, so the UI can say so. */
export let lastPreviewFallback: string | null = null;

/**
 * Run a read, and if the preview tracker turns out to be dead, drop preview
 * context and retry against the CDA.
 *
 * A stale tracker is a Contentstack-side session problem — only the app can
 * mint a new hash. Falling back means the page still renders published content
 * instead of showing an error.
 */
async function withStaleTrackerFallback<T>(
  contentTypeUid: string,
  run: () => Promise<T>,
): Promise<T> {
  try {
    const result = await run();
    lastPreviewFallback = null;
    return result;
  } catch (err) {
    if (!isStaleTrackerError(err)) throw err;

    console.warn(
      `[helper] live preview tracker expired for ${contentTypeUid}; ` +
        "falling back to published content. Reopen Live Preview in Contentstack " +
        "to get a fresh tracker.",
      err,
    );
    lastPreviewFallback =
      "Live preview tracker expired (error 382) — showing published content. " +
      "Reopen the entry from Contentstack to restore draft preview.";
    clearPreviewContext();
    return run();
  }
}

/** `addEditableTags(entry, ctUid, tagsAsObject, locale)` — `true` yields attribute objects. */
function tag<T extends object>(entry: T | null, ctUid: string): T | null {
  if (!entry) return null;
  addEditableTags(
    entry as Parameters<typeof addEditableTags>[0],
    ctUid,
    true,
    (entry as { locale?: string }).locale || locale,
  );
  return entry;
}

export async function getHeader(): Promise<HeaderEntry | null> {
  armPreview("header");
  const entries = await withStaleTrackerFallback("header", () =>
    getEntries<HeaderEntry>({ contentTypeUid: "header", locale }),
  );
  return tag(entries[0] ?? null, "header");
}

export async function getFooter(): Promise<FooterEntry | null> {
  armPreview("footer");
  const entries = await withStaleTrackerFallback("footer", () =>
    getEntries<FooterEntry>({ contentTypeUid: "footer", locale }),
  );
  return tag(entries[0] ?? null, "footer");
}

/**
 * A page is an entry of a content type with a URL field
 * (visual-builder/docs/pageAndEntry.md), resolved here by pathname.
 */
export async function getPage(
  url: string,
  ctx?: PreviewContext,
): Promise<PageEntry | null> {
  armPreview("page", ctx);
  const entry = await withStaleTrackerFallback("page", () =>
    getEntryByUrl<PageEntry>({
      contentTypeUid: "page",
      entryUrl: url,
      referenceFieldPath: ["page_components.latest_posts.posts"],
      // JSON RTE nested in a modular block: field -> block -> field.
      jsonRtePath: ["page_components.rich_text.body"],
      locale,
    }),
  );
  return tag(entry, "page");
}

export async function getBlogPost(
  url: string,
  ctx?: PreviewContext,
): Promise<BlogPostEntry | null> {
  armPreview("blog_post", ctx);
  const entry = await withStaleTrackerFallback("blog_post", () =>
    getEntryByUrl<BlogPostEntry>({
      contentTypeUid: "blog_post",
      entryUrl: url,
      referenceFieldPath: ["author"],
      jsonRtePath: ["body"],
      locale,
    }),
  );
  return tag(entry, "blog_post");
}

export async function getBlogPosts(
  ctx?: PreviewContext,
): Promise<BlogPostEntry[]> {
  armPreview("blog_post", ctx);
  const entries = await withStaleTrackerFallback("blog_post", () =>
    getEntries<BlogPostEntry>({
      contentTypeUid: "blog_post",
      referenceFieldPath: ["author"],
      jsonRtePath: ["body"],
      locale,
    }),
  );
  entries.forEach((e) => tag(e, "blog_post"));
  return entries;
}
