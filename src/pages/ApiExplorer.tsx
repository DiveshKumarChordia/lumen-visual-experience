/**
 * Shows how preview reads actually work, rather than reimplementing them.
 *
 * The central point: application code does NOT hand-build Preview REST
 * requests. You configure the Stack once and the SDKs switch host and auth for
 * you. This page reads the same content through:
 *
 *   1. The delivery Stack           — CDA *or* Preview REST, chosen by the SDK
 *   2. The Stack + Release/Timeline — via the official `Stack.livePreviewQuery`
 *   3. GraphQL Preview             — the one path with no SDK, built by hand
 *
 * Panel 1 also reports which host and token the SDK actually chose, so the
 * CDA -> Preview REST switch is observable instead of asserted.
 */
import { useCallback, useEffect, useState } from "react";

import config from "../config";
import { getBlogPosts, getPage } from "../helper";
import {
  applyPreviewContext,
  describeActiveRead,
  livePreviewHash,
  syncPreviewFromUrl,
} from "../sdk/previewContext";
import {
  GRAPHQL_PREVIEW_URL,
  fetchBlogPosts as gqlBlogPosts,
  fetchPages as gqlPages,
  type PreviewMode,
} from "../lib/previewGraphql";
import type { BlogPostEntry, PageEntry } from "../types";

type PanelState<T> =
  | { status: "loading" }
  | { status: "ok"; data: T }
  | { status: "error"; message: string };

function Panel<T>({
  title,
  endpoint,
  note,
  state,
  render,
}: {
  title: string;
  endpoint: string;
  note: string;
  state: PanelState<T>;
  render: (data: T) => React.ReactNode;
}) {
  return (
    <section className="api-panel">
      <header className="api-panel__head">
        <h2 className="api-panel__title">{title}</h2>
        <code className="api-panel__endpoint">{endpoint}</code>
        <p className="api-panel__note">{note}</p>
      </header>
      <div className="api-panel__body">
        {state.status === "loading" && <p className="api-panel__muted">Loading…</p>}
        {state.status === "error" && (
          <pre className="api-panel__error">{state.message}</pre>
        )}
        {state.status === "ok" && render(state.data)}
      </div>
    </section>
  );
}

type ActiveRead = ReturnType<typeof describeActiveRead>;

export default function ApiExplorer() {
  const [mode, setMode] = useState<PreviewMode>({ kind: "live" });
  const [hash, setHash] = useState("");

  const [viaStack, setViaStack] = useState<
    PanelState<{ posts: BlogPostEntry[]; active: ActiveRead }>
  >({ status: "loading" });
  const [viaTimeline, setViaTimeline] = useState<
    PanelState<{ page: PageEntry | null; active: ActiveRead }>
  >({ status: "loading" });
  const [viaGql, setViaGql] = useState<
    PanelState<{ pages: number; posts: { title: string; url: string }[] }>
  >({ status: "loading" });

  const run = useCallback(async () => {
    setViaStack({ status: "loading" });
    setViaTimeline({ status: "loading" });
    setViaGql({ status: "loading" });

    syncPreviewFromUrl();
    setHash(livePreviewHash());

    // 1. Plain Stack read. The SDK decides CDA vs Preview REST from the hash.
    try {
      const posts = await getBlogPosts();
      setViaStack({ status: "ok", data: { posts, active: describeActiveRead() } });
    } catch (err) {
      setViaStack({ status: "error", message: (err as Error).message });
    }

    // 2. Same Stack, but with Release / Timeline context applied through the
    //    official livePreviewQuery — no hand-set headers.
    try {
      applyPreviewContext({
        contentTypeUid: "page",
        releaseUid: mode.kind === "release" ? mode.releaseUid : undefined,
        timestamp: mode.kind === "timestamp" ? mode.timestamp : undefined,
      });
      const page = await getPage("/", {
        releaseUid: mode.kind === "release" ? mode.releaseUid : undefined,
        timestamp: mode.kind === "timestamp" ? mode.timestamp : undefined,
      });
      setViaTimeline({ status: "ok", data: { page, active: describeActiveRead() } });
    } catch (err) {
      setViaTimeline({ status: "error", message: (err as Error).message });
    }

    // 3. GraphQL preview — no SDK exists, so the request is built here.
    try {
      const [pages, posts] = await Promise.all([
        gqlPages({ mode }),
        gqlBlogPosts({ mode }),
      ]);
      setViaGql({
        status: "ok",
        data: {
          pages: pages.length,
          posts: posts.map((p) => ({ title: p.title, url: p.url })),
        },
      });
    } catch (err) {
      setViaGql({ status: "error", message: (err as Error).message });
    }
  }, [mode]);

  useEffect(() => {
    run();
  }, [run]);

  return (
    <main className="api-explorer">
      <div className="wrap">
        <h1 className="api-explorer__heading">How preview reads work</h1>
        <p className="api-explorer__intro">
          Application code does not call the Preview REST API directly. You arm
          the delivery <code>Stack</code> with a <code>preview_token</code> and a
          rest-preview <code>host</code>; the Live Preview SDK injects the hash
          into that Stack, and the delivery SDK then swaps host and auth per
          request. Panel 1 reports what it actually chose.
        </p>

        <div className="api-explorer__bar">
          <span className="api-explorer__hash">
            {hash ? (
              <>
                <code>ContentstackLivePreview.hash</code> = <code>{hash.slice(0, 16)}…</code>
              </>
            ) : (
              <em>
                No hash — open inside Live Preview / Visual Builder. Reads fall
                back to the CDA.
              </em>
            )}
          </span>

          <div className="api-explorer__modes">
            {(["live", "release", "timestamp"] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                className={`chip${mode.kind === kind ? " chip--on" : ""}`}
                onClick={() =>
                  setMode(
                    kind === "live"
                      ? { kind: "live" }
                      : kind === "release"
                        ? { kind: "release", releaseUid: "" }
                        : { kind: "timestamp", timestamp: new Date().toISOString() },
                  )
                }
              >
                {kind}
              </button>
            ))}
            <button type="button" className="chip chip--action" onClick={run}>
              re-run
            </button>
          </div>
        </div>

        {mode.kind === "release" && (
          <label className="api-explorer__field">
            Release UID → <code>release_id</code> header
            <input
              value={mode.releaseUid}
              onChange={(e) => setMode({ kind: "release", releaseUid: e.target.value })}
              placeholder="blt…"
            />
          </label>
        )}
        {mode.kind === "timestamp" && (
          <label className="api-explorer__field">
            ISO timestamp → <code>preview_timestamp</code> header
            <input
              value={mode.timestamp}
              onChange={(e) => setMode({ kind: "timestamp", timestamp: e.target.value })}
            />
          </label>
        )}

        <div className="api-explorer__grid">
          <Panel
            title="1. Delivery Stack"
            endpoint="Stack.ContentType('blog_post').Query().find()"
            note="One call. Reads the CDA when there is no hash, Preview REST when there is."
            state={viaStack}
            render={({ posts, active }) => (
              <>
                <dl className="api-kv">
                  <dt>host</dt>
                  <dd>{active.host || "—"}</dd>
                  <dt>auth header</dt>
                  <dd>{active.auth}</dd>
                  <dt>live_preview</dt>
                  <dd>{active.hash ? `${active.hash.slice(0, 14)}…` : "—"}</dd>
                </dl>
                <ul className="api-list">
                  {posts.map((p) => (
                    <li key={p.uid}>
                      <strong>{p.title}</strong>
                      <span>{p.url}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          />

          <Panel
            title="2. Stack + Release / Timeline"
            endpoint="Stack.livePreviewQuery({ release_id | preview_timestamp })"
            note="The official typed API for Release and Timeline preview. Keys are omitted rather than blanked, since the SDK tests hasOwnProperty."
            state={viaTimeline}
            render={({ page, active }) => (
              <>
                <dl className="api-kv">
                  <dt>release_id</dt>
                  <dd>{active.releaseUid || "—"}</dd>
                  <dt>preview_timestamp</dt>
                  <dd>{active.timestamp || "—"}</dd>
                </dl>
                {page ? (
                  <ul className="api-list">
                    <li>
                      <strong>{page.title}</strong>
                      <span>
                        {page.page_components?.length ?? 0} block(s) · {page.url}
                      </span>
                    </li>
                  </ul>
                ) : (
                  <p className="api-panel__muted">No page at “/”.</p>
                )}
              </>
            )}
          />

          <Panel
            title="3. GraphQL Preview"
            endpoint={GRAPHQL_PREVIEW_URL}
            note="The JS delivery SDK is REST-only, so this is the one place application code builds the preview request itself."
            state={viaGql}
            render={(data) => (
              <>
                <p className="api-panel__muted">
                  all_page → {data.pages} item(s)
                </p>
                <ul className="api-list">
                  {data.posts.map((p) => (
                    <li key={p.url}>
                      <strong>{p.title}</strong>
                      <span>{p.url}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          />
        </div>

        <p className="api-explorer__foot">
          The tracker (<code>POST /v3/live-preview/tracker</code>) is created by
          the Contentstack app, which holds the user session — the Live Preview
          SDK has no reference to it, and site code must not call it. See{" "}
          <code>npm run preview:demo</code> for the raw HTTP contract driven from
          Node, where a CMA login is available.
        </p>
      </div>
    </main>
  );
}
