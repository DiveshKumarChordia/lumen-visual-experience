/**
 * Preview context — the *official* way to drive Live Preview, Release Preview
 * and Timeline preview on a CSR site.
 *
 * The important thing to understand: you do NOT hand-roll requests to the
 * Preview REST API. You configure the delivery Stack, and the SDKs do it.
 *
 * How the pieces fit
 * ------------------
 * 1. `contentstack.Stack({ live_preview: { enable, preview_token, host } })`
 *    arms the delivery SDK for preview.
 *
 * 2. `ContentstackLivePreview.init({ stackSdk: Stack, ssr: false })` — the Live
 *    Preview SDK then *injects the hash into that Stack object* for you
 *    (live-preview-sdk/src/configManager/configManager.ts → `syncToStackSdk`,
 *     which sets `stackSdk.live_preview.live_preview = hash`).
 *
 * 3. On every query the delivery SDK checks for that hash and, when present
 *    (contentstack/dist/node/contentstack.js ~L1120, L2075):
 *      - swaps the host to `live_preview.host` (rest-preview)
 *      - DELETES the `access_token` (delivery token) header
 *      - sets `preview_token` + `live_preview` headers instead
 *      - drops `environment` from the body and forces a network read
 *    With no hash it falls back to the CDN + delivery token.
 *
 * So a single `Stack.ContentType(x).Query().find()` is a CDA read or a Preview
 * REST read depending on context — automatically. That is what "using the
 * Preview REST API" looks like from application code.
 *
 * The tracker (`POST /v3/live-preview/tracker`) is created by the Contentstack
 * app, which holds the user session — the Live Preview SDK contains zero
 * references to it, and site code must never call it.
 */
import ContentstackLivePreview from "@contentstack/live-preview-utils";
import type { LivePreviewQuery } from "contentstack";
import { Stack } from "./entry";

/** Documented accessor; empty string when not inside a preview pane. */
export function livePreviewHash(): string {
  return (ContentstackLivePreview as unknown as { hash: string }).hash ?? "";
}

/**
 * The hash already sitting on the Stack, if any.
 *
 * `ContentstackLivePreview.hash` is populated by an async postMessage handshake,
 * so on the first render it can still be empty while
 * `setLivePreviewTimelinePreviewForClient()` has already read one off the iframe
 * URL. Reading it back lets `applyPreviewContext` avoid clobbering it.
 */
function stackHash(): string {
  const lp = (Stack as unknown as { live_preview?: { live_preview?: string } }).live_preview;
  const h = lp?.live_preview;
  return h && h !== "init" ? h : "";
}

export interface PreviewContext {
  contentTypeUid?: string;
  /** Release Preview — content as if this Release were deployed. */
  releaseUid?: string;
  /** Timeline preview — content as of this ISO timestamp. */
  timestamp?: string;
}

/**
 * Applies preview context to the Stack via the official `livePreviewQuery`.
 *
 * Keys are added conditionally on purpose: the SDK uses
 * `query.hasOwnProperty('release_id')`, so passing `release_id: ""` would set an
 * empty header rather than clearing it.
 */
export function applyPreviewContext(ctx: PreviewContext = {}): void {
  // `livePreviewQuery` assigns `live_preview = query.live_preview || 'init'`
  // unconditionally, so passing an empty hash WIPES one that was already set.
  // Fall back to whatever the Stack currently holds.
  const hash = livePreviewHash() || stackHash();
  const query: Partial<LivePreviewQuery> = {};

  if (hash) query.live_preview = hash;
  if (ctx.contentTypeUid) query.content_type_uid = ctx.contentTypeUid;
  if (ctx.releaseUid) query.release_id = ctx.releaseUid;
  if (ctx.timestamp) query.preview_timestamp = ctx.timestamp;

  if (!Object.keys(query).length) return;

  Stack.livePreviewQuery(query as LivePreviewQuery);
}

/**
 * Picks up `live_preview`, `release_id` and `preview_timestamp` from the browser
 * URL — the params the Contentstack app puts on the iframe. Present at runtime
 * but absent from the package's typings, hence the guarded call.
 *
 * Call this ONCE at startup, not per fetch. The iframe URL keeps whatever
 * `live_preview` it was loaded with, so re-reading it on every request pins a
 * stale hash even after Contentstack issues a fresh one via postMessage —
 * which the API rejects with error_code 382.
 */
export function syncPreviewFromUrl(): void {
  const stack = Stack as unknown as {
    setLivePreviewTimelinePreviewForClient?: () => void;
  };
  stack.setLivePreviewTimelinePreviewForClient?.();
}

/**
 * Drop preview context so subsequent reads go to the CDA with the delivery
 * token. Used to recover from a dead tracker: the SDK treats the sentinel
 * `'init'` as "not previewing", and `livePreviewQuery` maps a falsy value to it.
 */
export function clearPreviewContext(): void {
  Stack.livePreviewQuery({ live_preview: "" } as unknown as LivePreviewQuery);
}

/**
 * error_code 382 — the tracker behind the hash is gone or expired. Only
 * Contentstack can mint a new one, so the app must fall back rather than retry.
 */
export function isStaleTrackerError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { error_code?: number; error_message?: string };
  if (e.error_code === 382) return true;
  return /live preview tracker is invalid|tracker hash might have expired/i.test(
    e.error_message ?? "",
  );
}

/** What the SDK will actually send — for display/diagnostics only. */
export function describeActiveRead(): {
  host: string;
  auth: "preview_token" | "access_token";
  hash: string;
  releaseUid?: string;
  timestamp?: string;
} {
  const lp = (Stack as unknown as {
    live_preview?: { live_preview?: string; host?: string };
    headers?: Record<string, string>;
    config?: { host?: string };
  });

  const hash = lp.live_preview?.live_preview;
  const isPreview = Boolean(hash && hash !== "init");

  return {
    host: (isPreview ? lp.live_preview?.host : lp.config?.host) ?? "",
    auth: isPreview ? "preview_token" : "access_token",
    hash: isPreview ? (hash as string) : "",
    releaseUid: lp.headers?.release_id,
    timestamp: lp.headers?.preview_timestamp,
  };
}
