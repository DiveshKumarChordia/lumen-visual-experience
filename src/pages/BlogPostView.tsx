import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import FetchDiagnostics from "../components/FetchDiagnostics";
import { getBlogPost } from "../helper";
import {
  onEntryChange,
  setPageContext,
  unsubscribeOnEntryChange,
} from "../sdk/entry";
import type { BlogPostEntry } from "../types";
import { cslp } from "../utils/cslp";

export default function BlogPostView() {
  const { pathname } = useLocation();
  const [post, setPost] = useState<BlogPostEntry | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchPost = async () => {
      try {
        const entry = await getBlogPost(pathname);
        if (cancelled) return;
        setError(null);
        setPost(entry);
        setState(entry ? "ready" : "missing");
        if (entry) {
          setPageContext({ entryUid: entry.uid, contentTypeUid: "blog_post" });
        }
      } catch (err) {
        if (cancelled) return;
        console.error("[BlogPostView] fetch failed", err);
        const e = err as { error_message?: string; message?: string; status?: number };
        setError(
          [e.status ? `HTTP ${e.status}` : null, e.error_message || e.message || JSON.stringify(err)]
            .filter(Boolean)
            .join(" — "),
        );
        setState("missing");
      }
    };

    fetchPost();
    const callbackUid = onEntryChange(fetchPost);

    return () => {
      cancelled = true;
      unsubscribeOnEntryChange(callbackUid);
    };
  }, [pathname]);

  if (state === "loading") return <div className="wrap state">Loading…</div>;

  if (state === "missing" || !post) {
    return (
      <FetchDiagnostics
        contentTypeUid="blog_post"
        lookupUrl={pathname}
        error={error}
      />
    );
  }

  const t = (post.$ ?? {}) as Record<string, unknown>;

  return (
    <main className="article">
      <div className="wrap article__inner">
        <p className="article__eyebrow">
          <Link to="/">Home</Link> <span aria-hidden="true">/</span> Blog
        </p>

        <h1 {...cslp(t.title)} className="article__title">
          {post.title}
        </h1>

        <div className="article__meta">
          {/* Reference field: an array even when the field is single. */}
          {post.author?.[0]?.title && (
            <span {...cslp(t.author)} className="byline">
              {post.author[0].avatar?.url && (
                <img
                  className="byline__avatar"
                  src={post.author[0].avatar.url}
                  alt={post.author[0].title}
                />
              )}
              <span>
                {post.author[0].title}
                {post.author[0].role ? ` · ${post.author[0].role}` : ""}
              </span>
            </span>
          )}
          {post.published_on && (
            <time {...cslp(t.published_on)} dateTime={post.published_on}>
              {new Date(post.published_on).toLocaleDateString(undefined, {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </time>
          )}
          {post.reading_minutes ? (
            <span {...cslp(t.reading_minutes)}>
              {post.reading_minutes} min read
            </span>
          ) : null}
          {post.tier && post.tier !== "public" && (
            <span {...cslp(t.tier)} className="badge">
              {post.tier}
            </span>
          )}
        </div>

        {post.excerpt && (
          <p {...cslp(t.excerpt)} className="article__excerpt">
            {post.excerpt}
          </p>
        )}

        {post.featured_image?.url && (
          <img
            {...cslp(t.featured_image)}
            className="article__image"
            src={post.featured_image.url}
            alt={post.featured_image.title || ""}
          />
        )}

        {/* JSON RTE converted to HTML by Utils.jsonToHTML in the helper. */}
        {post.body && (
          <div
            {...cslp(t.body)}
            className="article__body"
            dangerouslySetInnerHTML={{ __html: post.body }}
          />
        )}

        {/* Taxonomy field value: [{ taxonomy_uid, term_uid }]. */}
        {Boolean(post.taxonomies?.length) && (
          <ul {...cslp(t.taxonomies)} className="article__tags">
            {post.taxonomies?.map((term) => (
              <li key={`${term.taxonomy_uid}-${term.term_uid}`} className="tag">
                <span className="tag__scope">{term.taxonomy_uid}</span>
                {term.term_uid.replace(/_/g, " ")}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
