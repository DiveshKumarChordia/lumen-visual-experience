/**
 * Shown when a fetch fails or returns nothing.
 *
 * Previously both cases rendered a bare "not found", which hid real errors
 * (CORS, auth, network) behind a message that implied missing content. This
 * separates the two and reports what the SDK actually attempted.
 */
import config from "../config";
import { lastPreviewFallback } from "../helper";
import { describeActiveRead, livePreviewHash } from "../sdk/previewContext";

export default function FetchDiagnostics({
  contentTypeUid,
  lookupUrl,
  error,
}: {
  contentTypeUid: string;
  lookupUrl: string;
  /** Present when the request threw; absent when it simply matched nothing. */
  error?: string | null;
}) {
  const active = describeActiveRead();
  const inIframe = typeof window !== "undefined" && window.self !== window.top;

  return (
    <div className="wrap state">
      <h1>{error ? "Content request failed" : "No matching entry"}</h1>

      {error ? (
        <p>
          The request to Contentstack did not complete. This is a connectivity or
          auth problem, not missing content.
        </p>
      ) : (
        <p>
          The request succeeded but no <code>{contentTypeUid}</code> entry has the
          URL <code>{lookupUrl}</code>.
        </p>
      )}

      {error && <pre className="state__error">{error}</pre>}

      {lastPreviewFallback && (
        <p className="state__note">{lastPreviewFallback}</p>
      )}

      <dl className="state__kv">
        <dt>content type</dt>
        <dd>{contentTypeUid}</dd>
        <dt>looked up url</dt>
        <dd>{lookupUrl}</dd>
        <dt>host used</dt>
        <dd>{active.host || "(unset)"}</dd>
        <dt>auth header</dt>
        <dd>{active.auth}</dd>
        <dt>live_preview hash</dt>
        <dd>{active.hash ? `${active.hash.slice(0, 16)}…` : "(none)"}</dd>
        <dt>ContentstackLivePreview.hash</dt>
        <dd>{livePreviewHash() ? "present" : "(empty)"}</dd>
        <dt>preview token configured</dt>
        <dd>{config.PREVIEW_TOKEN ? "yes" : "no"}</dd>
        <dt>environment</dt>
        <dd>{config.ENVIRONMENT}</dd>
        <dt>branch</dt>
        <dd>{config.BRANCH}</dd>
        <dt>inside iframe</dt>
        <dd>{inIframe ? "yes (Visual Builder / Live Preview)" : "no"}</dd>
      </dl>

      <p className="state__hint">
        Open the browser console — the full error and the failing request URL are
        logged there.
      </p>
    </div>
  );
}
