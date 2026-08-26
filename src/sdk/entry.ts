/**
 * Delivery SDK + Live Preview / Visual Builder initialisation.
 *
 * Mirrors the canonical wiring in
 *   visual-builder/test-resources/csr/src/sdk/entry.ts
 * so this site behaves the same way inside Visual Builder:
 *
 *  - `live_preview.preview_token` + `host` point reads at rest-preview, which is
 *    what lets the iframe render *unpublished* draft content.
 *  - `mode: "builder"` makes the SDK target Visual Builder (not just Live Preview).
 *  - `ssr: false` + `stackSdk` is the client-side-rendering contract.
 */
import contentstack from "contentstack";
import * as Utils from "@contentstack/utils";
import type { Next, RenderNode, RenderOption } from "@contentstack/utils";
import type { EntryEmbedable } from "@contentstack/utils/dist/types/Models/embedded-object";
import ContentstackLivePreview from "@contentstack/live-preview-utils";
import config from "../config";

/** cdn host -> rest-preview host, the same substitution the reference app uses. */
const previewHost =
  config.PREVIEW_HOST ||
  config.API_HOST.replace("cdn", "rest-preview").replace(".io", ".com");

/**
 * Visual Builder propagates the active branch into the iframe URL as `?branch=`.
 * Scope the Stack to it so content comes from the branch the editor selected.
 */
export const currentBranch =
  new URLSearchParams(window.location.search).get("branch") ||
  config.BRANCH ||
  "main";

export const Stack = contentstack.Stack({
  api_key: config.API_KEY,
  delivery_token: config.DELIVERY_TOKEN,
  environment: config.ENVIRONMENT,
  branch: currentBranch,
  live_preview: {
    enable: true,
    preview_token: config.PREVIEW_TOKEN,
    host: previewHost,
  },
});

const appUrl = new URL(config.APP_HOST);

ContentstackLivePreview.init({
  enable: true,
  mode: "builder",
  ssr: false,
  stackSdk: Stack,
  stackDetails: {
    apiKey: config.API_KEY,
    environment: config.ENVIRONMENT,
    branch: currentBranch,
  },
  clientUrlParams: {
    host: appUrl.hostname,
    port: appUrl.port ? Number(appUrl.port) : 443,
    protocol: appUrl.protocol.replace(":", "") as "http" | "https",
  },
  // The pencil-icon edit button belongs to legacy Live Preview; Visual Builder
  // provides its own overlays, so keep it off and keep "Start Editing" on.
  editButton: { enable: false },
  editInVisualBuilderButton: { enable: true, position: "bottom-right" },
});

// The delivery SDK defaults to the NA CDN, so point it at the configured host.
if (config.API_HOST) {
  Stack.setHost(config.API_HOST);
}

/**
 * The package's default export is a union of the light and full SDK classes
 * (`typeof LightLivePreviewHoC | typeof ContentstackLivePreview`), so member
 * access on it collapses to `never`. We initialise with `mode: "builder"`, which
 * always yields the full class at runtime — narrow once here so no call site
 * needs a cast.
 */
type LivePreviewFull = {
  onEntryChange(
    cb: () => void,
    config?: { skipInitialRender?: boolean },
  ): string;
  unsubscribeOnEntryChange(cb: string | (() => void)): void;
  setPageContext(ctx: { entryUid: string; contentTypeUid: string }): void;
};

const LP = ContentstackLivePreview as unknown as LivePreviewFull;

/**
 * Registers a re-fetch callback. Returns a callback UID (NOT an unsubscribe
 * function) — pass it to `unsubscribeOnEntryChange` on cleanup.
 */
export const onEntryChange = (cb: () => void): string => LP.onEntryChange(cb);

export const unsubscribeOnEntryChange = (uid: string): void =>
  LP.unsubscribeOnEntryChange(uid);

/**
 * Tells Visual Builder which entry the visible page corresponds to, so the page
 * navigation bar and "Start Editing" open the right entry.
 */
export const setPageContext = (ctx: {
  entryUid: string;
  contentTypeUid: string;
}): void => LP.setPageContext(ctx);

/** `RenderOption` is an index signature, so each handler needs its exact type. */
const renderOption: RenderOption = {
  // `AnyNode` is not re-exported from the package index, so derive it.
  span: ((node, next) => next(node.children as Parameters<Next>[0])) as RenderNode,
};

type Query = {
  contentTypeUid: string;
  referenceFieldPath?: string[];
  jsonRtePath?: string[];
  locale?: string;
};

/** All entries of a content type. */
export async function getEntries<T = unknown>({
  contentTypeUid,
  referenceFieldPath,
  jsonRtePath,
  locale,
}: Query): Promise<T[]> {
  const query = Stack.ContentType(contentTypeUid).Query();
  if (referenceFieldPath) query.includeReference(referenceFieldPath);
  if (locale) query.language(locale);

  const result = await query.includeFallback().toJSON().find();
  const entries = (result?.[0] ?? []) as T[];

  if (jsonRtePath) {
    Utils.jsonToHTML({
      entry: entries as unknown as EntryEmbedable[],
      paths: jsonRtePath,
      renderOption,
    });
  }
  return entries;
}

/** A single entry matched on its `url` field — how a page is resolved. */
export async function getEntryByUrl<T = unknown>({
  contentTypeUid,
  entryUrl,
  referenceFieldPath,
  jsonRtePath,
  locale,
}: Query & { entryUrl: string }): Promise<T | null> {
  const query = Stack.ContentType(contentTypeUid).Query();
  if (referenceFieldPath) query.includeReference(referenceFieldPath);
  if (locale) query.language(locale);

  const result = await query
    .includeFallback()
    .toJSON()
    .where("url", entryUrl)
    .find();

  const entry = (result?.[0]?.[0] ?? null) as T | null;
  if (entry && jsonRtePath) {
    Utils.jsonToHTML({
      entry: entry as unknown as EntryEmbedable,
      paths: jsonRtePath,
      renderOption,
    });
  }
  return entry;
}
