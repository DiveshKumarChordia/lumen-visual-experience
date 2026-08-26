import { Link } from "react-router-dom";
import type { LatestPostsBlock } from "../../types";
import { cslp } from "../../utils/cslp";

export default function LatestPosts({ block }: { block: LatestPostsBlock }) {
  const t = (block.$ ?? {}) as Record<string, unknown>;
  const posts = block.max_items
    ? (block.posts ?? []).slice(0, block.max_items)
    : (block.posts ?? []);

  return (
    <section className="posts">
      <div className="wrap">
        {block.heading && (
          <h2 {...cslp(t.heading)} className="section-heading">
            {block.heading}
          </h2>
        )}
        {block.description && (
          <p {...cslp(t.description)} className="section-sub">
            {block.description}
          </p>
        )}
        <div className="posts__grid">
          {posts.map((post) => {
            // Referenced entries carry their own `$`, so their fields stay
            // individually editable inside the reference.
            const pt = (post.$ ?? {}) as Record<string, unknown>;
            const author = post.author?.[0];
            return (
              <article key={post.uid} className="post-card">
                {post.featured_image?.url && (
                  <Link to={post.url} className="post-card__media">
                    <img
                      {...cslp(pt.featured_image)}
                      src={post.featured_image.url}
                      alt={post.title}
                    />
                  </Link>
                )}
                <h3 {...cslp(pt.title)} className="post-card__title">
                  <Link to={post.url}>{post.title}</Link>
                </h3>
                {post.excerpt && (
                  <p {...cslp(pt.excerpt)} className="post-card__excerpt">
                    {post.excerpt}
                  </p>
                )}
                <div className="post-card__meta">
                  {author?.title && <span>{author.title}</span>}
                  {post.reading_minutes ? (
                    <span>{post.reading_minutes} min read</span>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
