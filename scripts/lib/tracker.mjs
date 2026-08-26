/**
 * Live Preview trackers.
 *
 * A tracker registers a preview session server-side; preview reads are keyed to
 * its hash. Creating one needs a CMA authtoken, so this is server/CI-side only —
 * never call it from browser code.
 *
 * The TYPE matters, and getting it wrong produces a confusing 500 rather than a
 * useful error:
 *
 *   livePreview / visualBuilder — draft preview of the latest saved content
 *   release                     — builds a RELEASE PLAN on the tracker, which is
 *                                 what `preview_timestamp` and `release_id`
 *                                 resolve against
 *
 * With a livePreview tracker, `ctx.release.plan` is never populated, so
 * `ReleaseInterceptor.getClosestPreviousRelease(plan, …)` dereferences undefined
 * and the request fails with `500 error_code 194`. Timeline preview therefore
 * REQUIRES a release tracker.
 *   preview-rest-api/src/app/content/release.interceptor.ts
 *   preview-rest-api/src/app/preview/release/release.service.ts
 *
 * Types are `TrackerTypes` in preview-rest-api/src/app/types/index.ts:
 *   release | previewShare | visualBuilder | livePreview | composableStudio
 */
import crypto from 'node:crypto';

/** Opaque session id; shape mirrors the e2e helper. */
export function makePreviewHash() {
  return `${crypto.randomBytes(12).toString('hex')}${Date.now().toString(36)}`;
}

async function postTracker({ previewHost, apiKey, authtoken, hash, branch, body }) {
  const res = await fetch(`https://${previewHost}/v3/live-preview/tracker`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      api_key: apiKey,
      authtoken,
      live_preview: hash,
      ...(branch ? { branch } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed;
  try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { raw: text }; }
  return { status: res.status, body: parsed };
}

/** Draft preview of latest saved content. */
export async function createLivePreviewTracker(opts) {
  const hash = opts.hash ?? makePreviewHash();
  const { status, body } = await postTracker({
    ...opts,
    hash,
    body: { type: opts.type ?? 'livePreview' },
  });
  return { hash, status, body, ok: status === 201 };
}

/**
 * Release/Timeline tracker.
 *
 * `payload.environment` must be the environment UID (not its name) and
 * `payload.schedules` maps releaseUid -> ISO date, overriding a release's own
 * scheduled_at. An empty object means "use each release's own schedule".
 *
 * The stack must already contain Releases — the service logs
 * "update releases triggered for empty releases" and does nothing otherwise.
 */
export async function createReleaseTracker({ environmentUid, schedules = {}, ...opts }) {
  const hash = opts.hash ?? makePreviewHash();
  const { status, body } = await postTracker({
    ...opts,
    hash,
    body: {
      type: 'release',
      payload: { environment: environmentUid, schedules },
    },
  });
  return { hash, status, body, ok: status === 201 };
}
